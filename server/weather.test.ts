import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { dressingHours, forecast, geocode, wearFor } from './weather.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const FORECAST = {
  utc_offset_seconds: -25200,
  current: { temperature_2m: 73.5, apparent_temperature: 71.6, relative_humidity_2m: 44.6, weather_code: 2, is_day: 1 },
  daily: { time: ['2026-10-07', '2026-10-08'], temperature_2m_max: [88.4, 91.1], temperature_2m_min: [66.9, 68.1],
    apparent_temperature_max: [90.2, 94.6], apparent_temperature_min: [64.4, 66], weather_code: [0, 3],
    sunrise: ['2026-10-07T06:50', '2026-10-08T06:50'], sunset: ['2026-10-07T18:31', '2026-10-08T18:30'],
    precipitation_probability_max: [10, 60], cloud_cover_mean: [22.4, 90], wind_speed_10m_max: [8.6, 20] },
  // A cool morning that warms up: 55°F at 7, 80°F by 1.
  hourly: { time: ['2026-10-07T06:00', '2026-10-07T07:00', '2026-10-07T10:00', '2026-10-07T13:00', '2026-10-08T08:00'],
    temperature_2m: [52, 57, 70, 82, 44], apparent_temperature: [50, 55, 68, 80, 40], precipitation_probability: [0, 5, 10, 0, 90],
    weather_code: [0, 0, 1, 2, 61] },
};

/** Answers like the Census geocoder (when `censusFinds`) and Open-Meteo; records each URL. */
function fakeNet(calls: string[], censusFinds = true) {
  return (async (url: string) => {
    calls.push(url);
    if (url.includes('census.gov')) return json({ result: { addressMatches: censusFinds ? [{ coordinates: { x: -117.8, y: 33.7 } }] : [] } });
    if (url.includes('geocoding-api')) return json({ results: url.includes('Irvine') ? [{ latitude: 33.68, longitude: -117.82 }] : [] });
    return json(FORECAST);
  }) as unknown as typeof fetch;
}

function appWithHome(calls: string[], address: string | null) {
  const db = openDb(':memory:');
  if (address) db.prepare(`INSERT INTO settings (key, value) VALUES ('homeAddress', ?)`).run(JSON.stringify(address));
  return buildApp(db, { weatherFetch: fakeNet(calls) });
}

describe('weather', () => {
  it("returns now, today's high and low, rounded, and caches them", async () => {
    const calls: string[] = [];
    const app = appWithHome(calls, '1 Main St, Irvine, CA 92618');
    const res = await app.inject({ url: '/api/weather' });
    expect(res.json()).toEqual({ temp: 74, feels: 72, high: 88, low: 67, humidity: 45, code: 2, isDay: true,
      // Home's 6:50 AM at UTC-7.
      sunrise: '2026-10-07T13:50:00.000Z', sunset: '2026-10-08T01:31:00.000Z',
      days: [{ date: '2026-10-07', high: 88, low: 67, code: 0, rain: 10, wind: 9, feelsHigh: 90, feelsLow: 64 },
        { date: '2026-10-08', high: 91, low: 68, code: 3, rain: 60, wind: 20, feelsHigh: 95, feelsLow: 66 }],
      // No time now given: from the first hour.
      hours: [
        { time: '2026-10-07T13:00:00.000Z', temp: 52, feels: 50, rain: 0, code: 0 },
        { time: '2026-10-07T14:00:00.000Z', temp: 57, feels: 55, rain: 5, code: 0 },
        { time: '2026-10-07T17:00:00.000Z', temp: 70, feels: 68, rain: 10, code: 1 },
        { time: '2026-10-07T20:00:00.000Z', temp: 82, feels: 80, rain: 0, code: 2 },
        { time: '2026-10-08T15:00:00.000Z', temp: 44, feels: 40, rain: 90, code: 61 },
      ],
      rainChance: 10, cloudCover: 22, wind: 9,
      // Only today's hours out (7 to 3) count: the cool start means a jacket, the warm afternoon no pants.
      wear: { pants: false, jacket: true, rain: false } });
    expect(calls.find((u) => u.includes('open-meteo.com/v1/forecast'))).toContain('latitude=33.700&longitude=-117.800');
    await app.inject({ url: '/api/weather' });
    expect(calls).toHaveLength(2);
  });

  it('works out what to wear from how it feels while out, rain and wind', () => {
    const day = (feels: number[], rain = 0) => feels.map((f) => ({ feels: f, rain }));
    expect(wearFor(day([75, 85]), 5)).toEqual({ pants: false, jacket: false, rain: false });
    expect(wearFor(day([60, 68]), 5)).toEqual({ pants: true, jacket: false, rain: false });
    expect(wearFor(day([50, 62]), 5)).toEqual({ pants: true, jacket: true, rain: false });
    // A windy cool day, and a warm wet one.
    expect(wearFor(day([62, 66]), 25)).toEqual({ pants: true, jacket: true, rain: false });
    expect(wearFor(day([72, 78], 60), 5)).toEqual({ pants: false, jacket: false, rain: true });
  });

  it('dresses for the hours still ahead, so a warm afternoon drops the morning jacket', async () => {
    const at = (time: string) => (async () => json({ ...FORECAST, current: { ...FORECAST.current, time } })) as unknown as typeof fetch;
    // At 1 PM only the 80°F hour is left; at 6 AM the cool start still counts.
    expect((await forecast({ lat: 33.7, lon: -117.8 }, at('2026-10-07T13:15'))).wear).toEqual({ pants: false, jacket: false, rain: false });
    expect((await forecast({ lat: 33.7, lon: -117.8 }, at('2026-10-07T06:00'))).wear).toEqual({ pants: false, jacket: true, rain: false });
    // School day, then the evening, then the rest of the night.
    expect([dressingHours(6), dressingHours(10), dressingHours(16), dressingHours(21)]).toEqual([[7, 15], [10, 15], [16, 20], [21, 23]]);
    // The hours around now: the ones gone by (up to six) and the ones ahead.
    expect((await forecast({ lat: 33.7, lon: -117.8 }, at('2026-10-07T10:20'))).hours.map((h) => h.feels)).toEqual([50, 55, 68, 80, 40]);
    expect((await forecast({ lat: 33.7, lon: -117.8 }, at('2026-10-07T06:00'))).hours.map((h) => h.feels)).toEqual([50, 55, 68, 80, 40]);
  });

  it('asks for a home address first', async () => {
    const res = await appWithHome([], null).inject({ url: '/api/weather' });
    expect(res.statusCode).toBe(404);
  });

  it('falls back to the town when the street address is not found', async () => {
    const calls: string[] = [];
    expect(await geocode('1 Main St, Irvine, CA 92618', fakeNet(calls, false))).toEqual({ lat: 33.68, lon: -117.82 });
    expect(calls[1]).toContain('name=Irvine');
  });
});

describe('weather away from home', () => {
  // Home in Irvine; Honolulu is far, Tustin is close by.
  const AT: Record<string, { x: number; y: number }> = { Irvine: { x: -117.8, y: 33.7 }, Honolulu: { x: -157.86, y: 21.31 }, Tustin: { x: -117.83, y: 33.74 } };
  const HAWAII = {
    utc_offset_seconds: -36000,
    daily: { time: ['2026-10-07', '2026-10-08', '2026-10-09'], temperature_2m_max: [84.2, 85, 83], temperature_2m_min: [72, 73.4, 71],
      apparent_temperature_max: [88, 90, 87], apparent_temperature_min: [74, 75, 73], weather_code: [1, 61, 2],
      precipitation_probability_max: [10, 70, 20], wind_speed_10m_max: [12, 15, 10] },
    hourly: { time: ['2026-10-08T09:00', '2026-10-08T10:00'], temperature_2m: [79.6, 81], apparent_temperature: [82, 84],
      precipitation_probability: [40, 50], weather_code: [61, 61] },
  };
  function setup() {
    const calls: string[] = [];
    const net = (async (url: string) => {
      calls.push(url);
      if (url.includes('census.gov')) {
        const town = Object.keys(AT).find((t) => decodeURIComponent(url).includes(t));
        return json({ result: { addressMatches: town ? [{ coordinates: AT[town] }] : [] } });
      }
      if (url.includes('geocoding-api')) return json({ results: [] });
      return json(url.includes('forecast_days=16') ? HAWAII : FORECAST);
    }) as unknown as typeof fetch;
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO settings (key, value) VALUES ('homeAddress', ?)`).run(JSON.stringify('1 Main St, Irvine, CA'));
    const app = buildApp(db, { weatherFetch: net });
    const add = async (title: string, location: string, allDay: boolean, start: string, end: string) =>
      (await app.inject({ method: 'POST', url: '/api/events', payload: { title, location, allDay, start, end } })).json().id as string;
    return { app, calls, add };
  }

  it("gives where this device is today's weather, rounded to about a kilometre", async () => {
    const { app, calls } = setup();
    const res = await app.inject({ url: '/api/weather?lat=21.30694&lon=-157.85833' });
    expect(res.statusCode).toBe(200);
    expect(calls.at(-1)).toContain('latitude=21.310&longitude=-157.860');
    expect((await app.inject({ url: '/api/weather?lat=200&lon=0' })).statusCode).toBe(400);
  });

  it('forecasts far-away events on their days, and leaves nearby ones be', async () => {
    const { app, add } = setup();
    const trip = await add('Hawaii trip', 'Waikiki, Honolulu, HI', true, '2026-10-08', '2026-10-10');
    // 9 AM in Honolulu (UTC-10).
    const luau = await add('Luau', 'Beach, Honolulu, HI', false, '2026-10-08T19:00:00.000Z', '2026-10-08T21:00:00.000Z');
    const park = await add('Park', '1 Park Rd, Tustin, CA', false, '2026-10-08T19:00:00.000Z', '2026-10-08T20:00:00.000Z');
    const far = await add('Next year', 'Waikiki, Honolulu, HI', true, '2027-10-08', '2027-10-09');
    const res = (await app.inject({ url: `/api/weather/events?ids=${[trip, luau, park, far].join(',')}` })).json();
    expect(Object.keys(res).sort()).toEqual([trip, luau, far].sort());
    expect(res[trip]).toEqual({ miles: 2581, later: false,
      days: [{ date: '2026-10-08', high: 85, low: 73, code: 61, rain: 70, feelsHigh: 90, feelsLow: 75 },
        { date: '2026-10-09', high: 83, low: 71, code: 2, rain: 20, feelsHigh: 87, feelsLow: 73 }],
      wear: { pants: false, jacket: false, rain: true } });
    expect(res[luau].at).toEqual({ temp: 80, feels: 82, rain: 40, code: 61 });
    expect(res[luau].days.map((d: { date: string }) => d.date)).toEqual(['2026-10-08']);
    expect(res[far]).toMatchObject({ days: [], wear: null, later: true });
  });
});
