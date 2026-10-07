import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { familyFriendly } from './daily.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Pretend services: the first joke is grim, then a nice one. */
function fakeNet(calls: string[]) {
  let jokes = 0;
  return (async (url: string) => {
    calls.push(url);
    if (url.includes('icanhazdadjoke')) return json({ joke: ++jokes === 1 ? 'A doll was found dead in a rice paddy.' : 'Why did the scarecrow win an award? He was outstanding in his field.' });
    return json([{ q: 'Be happy now.', a: 'Dan Millman' }]);
  }) as unknown as typeof fetch;
}

describe('daily cards', () => {
  it("fetches today's joke and quote once, then keeps them for the day", async () => {
    const calls: string[] = [];
    const app = buildApp(openDb(':memory:'), { dailyFetch: fakeNet(calls) });
    const res = (await app.inject({ url: '/api/daily?day=2026-10-07' })).json();
    expect(res.joke.text).toMatch(/scarecrow/);
    expect(res.quote).toEqual({ text: 'Be happy now.', author: 'Dan Millman' });
    const n = calls.length;
    await app.inject({ url: '/api/daily?day=2026-10-07' });
    expect(calls).toHaveLength(n);
  });

  it('shows what it can when a service is down', async () => {
    const net = fakeNet([]);
    const app = buildApp(openDb(':memory:'), { dailyFetch: (async (url: string) =>
      url.includes('zenquotes') ? new Response('', { status: 503 }) : net(url)) as unknown as typeof fetch });
    const res = (await app.inject({ url: '/api/daily?day=2026-10-07' })).json();
    expect(res.quote).toBeNull();
    expect(res.joke).not.toBeNull();
  });

  it('keeps grim things off the wall', () => {
    expect(familyFriendly('Why did the scarecrow win an award?')).toBe(true);
    expect(familyFriendly('A doll was found dead in a rice paddy.')).toBe(false);
  });
});
