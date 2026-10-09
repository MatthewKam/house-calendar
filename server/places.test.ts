import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { googlePlaces, type PlaceSearch } from './places.ts';

describe('address suggestions', () => {
  it('suggests places near home, once per thing typed, and none without a key or for short input', async () => {
    const search = vi.fn<PlaceSearch>(async (q) => [{ text: `${q} St, Town`, main: `${q} St`, secondary: 'Town' }]);
    const app = buildApp(openDb(':memory:'), { places: search });
    await app.inject({ method: 'PUT', url: '/api/settings/homeAddress', payload: { value: '1 Home Rd' } });
    expect(JSON.parse((await app.inject({ url: '/api/places?q=ab' })).body)).toEqual([]);
    const got = JSON.parse((await app.inject({ url: '/api/places?q=Main&session=s1' })).body);
    expect(got).toEqual([{ text: 'Main St, Town', main: 'Main St', secondary: 'Town' }]);
    await app.inject({ url: '/api/places?q=main&session=s1' });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('Main', 's1', '1 Home Rd');
    const off = buildApp(openDb(':memory:'), {});
    expect(JSON.parse((await off.inject({ url: '/api/places?q=Main' })).body)).toEqual([]);
  });

  it('asks Google with the session, leaning toward home', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      const data = url.endsWith('searchText')
        ? { places: [{ location: { latitude: 1, longitude: 2 } }] }
        : { suggestions: [{ placePrediction: { text: { text: '5 Oak Ave, Town' }, structuredFormat: { mainText: { text: '5 Oak Ave' }, secondaryText: { text: 'Town' } } } }, {}] };
      return new Response(JSON.stringify(data));
    }) as typeof fetch;
    const places = await googlePlaces('key', fake)('5 Oak', 'tok', 'Home');
    expect(places).toEqual([{ text: '5 Oak Ave, Town', main: '5 Oak Ave', secondary: 'Town' }]);
    expect(calls[1].body).toEqual({ input: '5 Oak', sessionToken: 'tok', locationBias: { circle: { center: { latitude: 1, longitude: 2 }, radius: 50_000 } } });
    // Home is looked up once.
    await googlePlaces('key', fake)('5 Oa', 'tok', 'Home');
    expect(calls.filter((c) => c.url.endsWith('searchText'))).toHaveLength(2); // one per searcher
  });
});
