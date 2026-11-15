import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { familyFriendly } from './daily.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A pretend joke service: the first joke is grim, then a nice one. */
function fakeNet(calls: string[]) {
	let jokes = 0;
	return (async (url: string) => {
		calls.push(url);
		if (url.includes('icanhazdadjoke'))
			return json({
				joke:
					++jokes === 1
						? 'A doll was found dead in a rice paddy.'
						: 'Why did the scarecrow win an award? He was outstanding in his field.',
			});
		return new Response('', { status: 404 });
	}) as unknown as typeof fetch;
}

describe('daily cards', () => {
	it("fetches today's joke once, then keeps it for the day", async () => {
		const calls: string[] = [];
		const app = buildApp(openDb(':memory:'), { dailyFetch: fakeNet(calls) });
		const res = (await app.inject({ url: '/api/daily?day=2026-10-07' })).json();
		expect(res.joke.text).toMatch(/scarecrow/);
		expect(res).toEqual({ joke: { text: expect.stringMatching(/scarecrow/) } });
		const n = calls.length;
		await app.inject({ url: '/api/daily?day=2026-10-07' });
		expect(calls).toHaveLength(n);
	});

	it('gives no joke when the service is down', async () => {
		const app = buildApp(openDb(':memory:'), {
			dailyFetch: (async () => new Response('', { status: 503 })) as unknown as typeof fetch,
		});
		const res = (await app.inject({ url: '/api/daily?day=2026-10-07' })).json();
		expect(res).toEqual({ joke: null });
	});

	it('keeps grim things off the wall', () => {
		expect(familyFriendly('Why did the scarecrow win an award?')).toBe(true);
		expect(familyFriendly('A doll was found dead in a rice paddy.')).toBe(false);
	});
});
