import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';

/** Today's weather at home, as the wall shows it under the month. */
export interface Weather {
  /** Now, in °F. */
  temp: number;
  high: number;
  low: number;
  /** WMO weather code (0 clear ... 99 thunderstorm), which picks the icon. */
  code: number;
  isDay: boolean;
  /** Today's sunrise and sunset, as instants. */
  sunrise: string;
  sunset: string;
  /** Today and the next six days. */
  days: { date: string; high: number; low: number; code: number }[];
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
    + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset'
    + '&temperature_unit=fahrenheit&timezone=auto&forecast_days=7';
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const w = await res.json();
  // Sunrise and sunset come as home's local clock time ("2026-10-07T06:50"); make them instants.
  const instant = (local: string) => new Date(Date.parse(`${local}:00Z`) - w.utc_offset_seconds * 1000).toISOString();
  return {
    temp: Math.round(w.current.temperature_2m),
    high: Math.round(w.daily.temperature_2m_max[0]),
    low: Math.round(w.daily.temperature_2m_min[0]),
    code: w.current.weather_code,
    isDay: w.current.is_day === 1,
    sunrise: instant(w.daily.sunrise[0]),
    sunset: instant(w.daily.sunset[0]),
    days: (w.daily.time as string[]).map((date, i) => ({
      date,
      high: Math.round(w.daily.temperature_2m_max[i]),
      low: Math.round(w.daily.temperature_2m_min[i]),
      code: w.daily.weather_code[i],
    })),
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
