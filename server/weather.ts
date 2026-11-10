import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import type { Wear, Weather } from '../shared/weather.ts';

/** The hours the forecast gives around now: this many gone by, and this many ahead. */
const HOURS_BEFORE = 6;
const HOURS_AFTER = 18;

/**
 * The hours that count for dressing (home's clock): out the door to the end of the school day, or once
 * that's over, the evening. Only the hours still ahead count, so a cold morning that's turned warm
 * doesn't still ask for a jacket.
 */
const OUT_FROM = 7;
const OUT_TO = 15;
const EVENING_TO = 20;

/** The first and last hour that count for dressing, `now` being the hour of the day it is. */
export function dressingHours(now: number): [number, number] {
  if (now < OUT_TO) return [Math.max(now, OUT_FROM), OUT_TO];
  if (now < EVENING_TO) return [now, EVENING_TO];
  return [now, 23];
}

/** Pants when it never feels warmer than this while out (°F); a jacket when it feels colder than this at any point. */
const PANTS_BELOW = 70;
const JACKET_BELOW = 58;
/** Rain gear at this chance of rain (%) while out, or a jacket for wind this strong (mph). */
const RAIN_FROM = 40;
const WINDY = 20;

/**
 * What to wear, from how warm it feels (the wind's chill counted in) and the chance of rain while
 * they're out: long pants on a day that never gets warm, a jacket for a cold moment or a cold wind,
 * rain gear when rain's likely.
 */
export function wearFor(hours: { feels: number; rain: number }[], wind: number): Wear {
  const most = Math.max(...hours.map((h) => h.feels));
  const least = Math.min(...hours.map((h) => h.feels));
  return {
    pants: most < PANTS_BELOW,
    jacket: least < JACKET_BELOW || (wind >= WINDY && most < PANTS_BELOW),
    rain: Math.max(...hours.map((h) => h.rain)) >= RAIN_FROM,
  };
}

interface Place { lat: number; lon: number }

const CACHE_MS = 10 * 60_000;

/**
 * Finds the home address on a map. US street addresses go to the Census Bureau's free geocoder; if it
 * finds nothing (or the address isn't in the US), Open-Meteo's place search tries the town instead.
 */
export async function geocode(address: string, fetchImpl: typeof fetch = fetch): Promise<Place | null> {
  const census = await fetchImpl('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address='
    + encodeURIComponent(address)).then((r) => (r.ok ? r.json() : null), () => null);
  const match = census?.result?.addressMatches?.[0]?.coordinates;
  if (match) return { lat: match.y, lon: match.x };
  // "1 Main St, Irvine, CA 92618" → try "Irvine", then the other parts.
  const parts = address.split(',').map((p) => p.trim().replace(/\s+\d{5}(-\d{4})?$/, '')).filter(Boolean);
  for (const name of [...parts.slice(1), parts[0]]) {
    const found = await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : null), () => null);
    const place = found?.results?.[0];
    if (place) return { lat: place.latitude, lon: place.longitude };
  }
  return null;
}

/** Current conditions and today's high and low from Open-Meteo (free, no key). */
export async function forecast(place: Place, fetchImpl: typeof fetch = fetch): Promise<Weather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(3)}&longitude=${place.lon.toFixed(3)}`
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day'
    + '&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,weather_code,sunrise,sunset,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max'
    + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code'
    + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=8';
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const w = await res.json();
  // Sunrise and sunset come as home's local clock time ("2026-10-07T06:50"); make them instants.
  const instant = (local: string) => new Date(Date.parse(`${local}:00Z`) - w.utc_offset_seconds * 1000).toISOString();
  // Today's hours still ahead while they're out ("2026-10-07T08:00", home's clock).
  const today = w.daily.time[0] as string;
  const [from, to] = dressingHours(w.current.time ? Number((w.current.time as string).slice(11, 13)) : 0);
  const out = (w.hourly.time as string[]).flatMap((t, i) => {
    const hour = Number(t.slice(11, 13));
    return t.startsWith(today) && hour >= from && hour <= to
      ? [{ feels: w.hourly.apparent_temperature[i] as number, rain: (w.hourly.precipitation_probability[i] ?? 0) as number }] : [];
  });
  const wind = Math.round(w.daily.wind_speed_10m_max[0] ?? 0);
  // The hours around now (home's clock): a few gone by, so now sits on the line, and most of the day ahead.
  const thisHour = w.current.time ? (w.current.time as string).slice(0, 13) : '';
  const at = Math.max(0, (w.hourly.time as string[]).findIndex((t) => t.slice(0, 13) >= thisHour));
  const first = Math.max(0, at - HOURS_BEFORE);
  const hours = (w.hourly.time as string[]).slice(first, at + HOURS_AFTER + 1).map((t, j) => {
    const i = first + j;
    return {
      time: instant(t),
      temp: Math.round(w.hourly.temperature_2m?.[i] ?? w.hourly.apparent_temperature[i]),
      feels: Math.round(w.hourly.apparent_temperature[i]),
      rain: Math.round(w.hourly.precipitation_probability[i] ?? 0),
      code: w.hourly.weather_code?.[i] ?? w.current.weather_code,
    };
  });
  return {
    temp: Math.round(w.current.temperature_2m),
    feels: Math.round(w.current.apparent_temperature ?? w.current.temperature_2m),
    high: Math.round(w.daily.temperature_2m_max[0]),
    low: Math.round(w.daily.temperature_2m_min[0]),
    humidity: Math.round(w.current.relative_humidity_2m),
    code: w.current.weather_code,
    isDay: w.current.is_day === 1,
    sunrise: instant(w.daily.sunrise[0]),
    sunset: instant(w.daily.sunset[0]),
    days: (w.daily.time as string[]).map((date, i) => ({
      date,
      high: Math.round(w.daily.temperature_2m_max[i]),
      low: Math.round(w.daily.temperature_2m_min[i]),
      code: w.daily.weather_code[i],
      rain: Math.round(w.daily.precipitation_probability_max[i] ?? 0),
      wind: Math.round(w.daily.wind_speed_10m_max[i] ?? 0),
      feelsHigh: Math.round(w.daily.apparent_temperature_max?.[i] ?? w.daily.temperature_2m_max[i]),
      feelsLow: Math.round(w.daily.apparent_temperature_min?.[i] ?? w.daily.temperature_2m_min[i]),
    })),
    hours,
    rainChance: Math.round(w.daily.precipitation_probability_max[0] ?? 0),
    cloudCover: Math.round(w.daily.cloud_cover_mean[0] ?? 0),
    wind,
    // No hours (the forecast came without them): judged by the day's high and low instead.
    wear: wearFor(out.length ? out : [{ feels: w.daily.temperature_2m_max[0], rain: w.daily.precipitation_probability_max[0] ?? 0 },
      { feels: w.daily.temperature_2m_min[0], rain: 0 }], wind),
  };
}

/** GET /api/weather: the weather at the home address set in Settings, refreshed every 10 minutes. */
export function registerWeather(app: FastifyInstance, db: DB, fetchImpl: typeof fetch = fetch) {
  let place: { address: string; at: Place | null } | null = null;
  let cached: { address: string; weather: Weather; at: number } | null = null;

  app.get('/api/weather', async (_req, reply) => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'homeAddress'`).get() as { value: string } | undefined;
    const address = row ? (JSON.parse(row.value) as string).trim() : '';
    if (!address) return reply.code(404).send({ error: 'Set your home address in Settings to see the weather' });
    if (cached?.address === address && Date.now() - cached.at < CACHE_MS) return cached.weather;
    try {
      // Looked up once per address.
      if (place?.address !== address) place = { address, at: await geocode(address, fetchImpl) };
      if (!place.at) return reply.code(404).send({ error: "Couldn't find the home address on a map" });
      const weather = await forecast(place.at, fetchImpl);
      cached = { address, weather, at: Date.now() };
      return weather;
    } catch (err) {
      app.log.warn({ err }, 'weather lookup failed');
      // An older answer beats none.
      if (cached?.address === address) return cached.weather;
      return reply.code(502).send({ error: "Couldn't get the weather" });
    }
  });
}
