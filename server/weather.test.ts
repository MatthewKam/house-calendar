import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { geocode } from './weather.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const FORECAST = {
  utc_offset_seconds: -25200,
  current: { temperature_2m: 73.5, relative_humidity_2m: 44.6, weather_code: 2, is_day: 1 },
  daily: { time: ['2026-10-07', '2026-10-08'], temperature_2m_max: [88.4, 91.1], temperature_2m_min: [66.9, 68.1], weather_code: [0, 3],
    sunrise: ['2026-10-07T06:50', '2026-10-08T06:50'], sunset: ['2026-10-07T18:31', '2026-10-08T18:30'] },
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
    expect(res.json()).toEqual({ temp: 74, high: 88, low: 67, humidity: 45, code: 2, isDay: true,
      // Home's 6:50 AM at UTC-7.
      sunrise: '2026-10-07T13:50:00.000Z', sunset: '2026-10-08T01:31:00.000Z',
      days: [{ date: '2026-10-07', high: 88, low: 67, code: 0 }, { date: '2026-10-08', high: 91, low: 68, code: 3 }] });
    expect(calls.find((u) => u.includes('open-meteo.com/v1/forecast'))).toContain('latitude=33.700&longitude=-117.800');
    await app.inject({ url: '/api/weather' });
    expect(calls).toHaveLength(2);
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
