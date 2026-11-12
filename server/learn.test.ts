import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { bucket } from './rewards.ts';
import { bornYearsAgo, household } from './testing.ts';

// Nolan is 2 (Little), Tayen 4 (Early), in TODAY's year.
const setup = () =>
	household([
		{ id: 'alex', name: 'Alex' },
		{ id: 'nolan', name: 'Nolan', birthdate: bornYearsAgo(2, new Date(TODAY)) },
		{ id: 'tayen', name: 'Tayen', birthdate: bornYearsAgo(4, new Date(TODAY)) },
	]);

const TODAY = '2026-11-06';

describe('learning', () => {
	it('gives each stage its four games, off until a guardian turns it on', async () => {
		const { call } = setup();
		const kids = (await call('GET', `/api/learn?today=${TODAY}`)).body;
		expect(kids.map((k: { memberId: string }) => k.memberId)).toEqual(['nolan', 'tayen']);
		expect(kids[0]).toMatchObject({ enabled: false });
		expect(kids[0].games.map((g: { game: string }) => g.game)).toEqual(['sounds', 'peekaboo', 'pop', 'apples']);
		expect(kids[1].games.map((g: { game: string }) => g.game)).toEqual(['adding', 'maze', 'letters', 'memory']);
		expect(kids[1].games[0]).toEqual({ game: 'adding', level: 1, maxLevel: 6, ready: false });
		expect(
			(await call('POST', '/api/learn/tayen/done', { today: TODAY, game: 'adding', level: 1, rounds: 3, firstTry: 3 }))
				.status,
		).toBe(409);

		expect((await call('PUT', '/api/learn/alex', { today: TODAY, enabled: true })).status).toBe(400);
		expect((await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true })).body).toMatchObject({
			enabled: true,
		});
		// Only their own stage's games.
		expect(
			(await call('POST', '/api/learn/tayen/done', { today: TODAY, game: 'sounds', level: 1, rounds: 3, firstTry: 3 }))
				.status,
		).toBe(400);
	});

	it('earns no stars', async () => {
		const { db, call } = setup();
		await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true });
		const done = await call('POST', '/api/learn/tayen/done', {
			today: TODAY,
			game: 'maze',
			level: 1,
			rounds: 1,
			firstTry: 1,
		});
		expect(done.body).toMatchObject({ leveledUp: false });
		expect(bucket(db, 'tayen')).toBe(0);
	});

	it('moves a game up after three perfect plays in a row, and a guardian can move it', async () => {
		const { call } = setup();
		await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true });
		const play = (firstTry: number, level = 1) =>
			call('POST', '/api/learn/tayen/done', { today: TODAY, game: 'letters', level, rounds: 3, firstTry });
		expect((await play(3)).body.leveledUp).toBe(false);
		expect((await play(2)).body.leveledUp).toBe(false);
		expect((await play(3)).body.leveledUp).toBe(false);
		expect((await play(3)).body.leveledUp).toBe(false);
		const up = (await play(3)).body;
		expect(up.leveledUp).toBe(true);
		expect(up.games.find((g: { game: string }) => g.game === 'letters').level).toBe(2);

		// A guardian moves it back down: only plays from then on count.
		expect((await call('PUT', '/api/learn/tayen', { today: TODAY, levels: { letters: 7 } })).status).toBe(400);
		expect((await call('PUT', '/api/learn/tayen', { today: TODAY, levels: { sounds: 2 } })).status).toBe(400);
		const down = (await call('PUT', '/api/learn/tayen', { today: TODAY, levels: { letters: 1 } })).body;
		expect(down).toMatchObject({ enabled: true });
		expect(down.games.find((g: { game: string }) => g.game === 'letters').level).toBe(1);
		expect((await play(3)).body.leveledUp).toBe(false);
		expect((await play(3)).body.leveledUp).toBe(false);
		expect((await play(3)).body.leveledUp).toBe(true);
		// Never past the top.
		await call('PUT', '/api/learn/tayen', { today: TODAY, levels: { letters: 6 } });
		for (let i = 0; i < 3; i++) expect((await play(3, 6)).body.leveledUp).toBe(false);
	});

	it("doesn't move a 2-year-old's game up: it's ready, and a grown-up moves it", async () => {
		const { call } = setup();
		await call('PUT', '/api/learn/nolan', { today: TODAY, enabled: true });
		const play = async (firstTry = 3) => {
			const body = (
				await call('POST', '/api/learn/nolan/done', { today: TODAY, game: 'apples', level: 1, rounds: 3, firstTry })
			).body;
			return { leveledUp: body.leveledUp, ...body.games.find((g: { game: string }) => g.game === 'apples') };
		};
		expect(await play()).toMatchObject({ leveledUp: false, level: 1, ready: false });
		expect(await play()).toMatchObject({ leveledUp: false, level: 1, ready: false });
		expect(await play()).toMatchObject({ leveledUp: false, level: 1, ready: true });
		// Still level 1, however many more.
		for (let i = 0; i < 4; i++) expect(await play()).toMatchObject({ leveledUp: false, level: 1, ready: true });

		// A grown-up moves it up: no longer waiting, and it starts counting again.
		const up = (await call('PUT', '/api/learn/nolan', { today: TODAY, levels: { apples: 2 } })).body;
		expect(up.games.find((g: { game: string }) => g.game === 'apples')).toMatchObject({ level: 2, ready: false });
		const playAt2 = async () =>
			(
				await call('POST', '/api/learn/nolan/done', { today: TODAY, game: 'apples', level: 2, rounds: 3, firstTry: 3 })
			).body.games.find((g: { game: string }) => g.game === 'apples');
		expect(await playAt2()).toMatchObject({ level: 2, ready: false });
		expect(await playAt2()).toMatchObject({ level: 2, ready: false });
		expect(await playAt2()).toMatchObject({ level: 2, ready: true });
		// Moved back down instead: not ready any more.
		const down = (await call('PUT', '/api/learn/nolan', { today: TODAY, levels: { apples: 1 } })).body;
		expect(down.games.find((g: { game: string }) => g.game === 'apples')).toMatchObject({ level: 1, ready: false });
	});

	it("keeps a grown-up's recorded animal noises", async () => {
		const { db } = setup();
		const app = buildApp(db);
		const put = (animal: string, body: Buffer, type = 'audio/webm;codecs=opus') =>
			app.inject({
				method: 'PUT',
				url: `/api/learn/sounds/${animal}`,
				payload: body,
				headers: { 'content-type': type },
			});
		const moo = Buffer.from('moo moo');
		expect((await put('dragon', moo)).statusCode).toBe(404);
		expect((await put('cow', moo, 'text/plain')).statusCode).toBe(400);
		const saved = await put('cow', moo);
		expect(saved.statusCode).toBe(200);
		expect((await app.inject({ method: 'GET', url: '/api/learn/sounds' })).json()).toEqual([
			{ animal: 'cow', version: saved.json().version },
		]);
		const got = await app.inject({ method: 'GET', url: '/api/learn/sounds/cow' });
		expect(got.headers['content-type']).toBe('audio/webm');
		expect(got.rawPayload.equals(moo)).toBe(true);
		expect((await app.inject({ method: 'DELETE', url: '/api/learn/sounds/cow' })).statusCode).toBe(204);
		expect((await app.inject({ method: 'GET', url: '/api/learn/sounds/cow' })).statusCode).toBe(404);
	});

	it('moves Math, Maze and Pairs up by their own rules', async () => {
		const { call } = setup();
		await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true });
		const play = (game: string, firstTry: number, rounds = 3) =>
			call('POST', '/api/learn/tayen/done', { today: TODAY, game, level: 1, rounds, firstTry });
		// Math: 5 perfect in a row (3 isn't enough)...
		for (let i = 0; i < 4; i++) expect((await play('adding', 3)).body.leveledUp).toBe(false);
		expect((await play('adding', 3)).body.leveledUp).toBe(true);
		// ...or 20 games, perfect or not.
		await call('PUT', '/api/learn/tayen', { today: TODAY, levels: { adding: 1 } });
		for (let i = 0; i < 19; i++) expect((await play('adding', 1)).body.leveledUp).toBe(false);
		expect((await play('adding', 1)).body.leveledUp).toBe(true);
		// Maze: only 20 games, however perfect.
		for (let i = 0; i < 19; i++) expect((await play('maze', 3)).body.leveledUp).toBe(false);
		expect((await play('maze', 3)).body.leveledUp).toBe(true);
		// Pairs: 5 perfect in a row, or 20 games.
		for (let i = 0; i < 4; i++) expect((await play('memory', 1, 1)).body.leveledUp).toBe(false);
		expect((await play('memory', 1, 1)).body.leveledUp).toBe(true);
		// Letters: 3 perfect in a row, and no count.
		for (let i = 0; i < 20; i++) expect((await play('letters', 0, 4)).body.leveledUp).toBe(false);
	});

	it("tells the grown-ups' phones when a 2-year-old's game is ready, and when a game reaches its top level", async () => {
		const db = openDb(':memory:');
		const year = Number(TODAY.slice(0, 4));
		db.prepare(`INSERT INTO members (id, name, color) VALUES ('alex', 'Alex', '#000000')`).run();
		db.prepare(
			`INSERT INTO members (id, name, color, birthdate) VALUES ('nolan', 'Nolan Kam', '#111111', ?), ('tayen', 'Tayen Kam', '#222222', ?)`,
		).run(`${year - 2}-01-01`, `${year - 4}-01-01`);
		// Alex's phone and Nolan's own device; only Alex's hears about it.
		const sub = (e: string) => JSON.stringify({ endpoint: e, keys: { p256dh: 'p', auth: 'a' } });
		db.prepare(
			`INSERT INTO push_devices (id, endpoint, subscription, member_id, time_zone) VALUES ('p1', 'https://push.test/alex', ?, 'alex', 'UTC'), ('p2', 'https://push.test/nolan', ?, 'nolan', 'UTC')`,
		).run(sub('https://push.test/alex'), sub('https://push.test/nolan'));
		const sent: { to: string; title: string }[] = [];
		const app = buildApp(db, {
			push: {
				publicKey: 'test',
				send: async (s, a) => {
					sent.push({ to: s.endpoint, title: a.title });
				},
			},
		});
		const call = (method: string, url: string, payload: object) =>
			app.inject({ method: method as 'POST', url, payload });
		const settle = () => new Promise((r) => setTimeout(r, 10));

		await call('PUT', '/api/learn/nolan', { today: TODAY, enabled: true, levels: { apples: 5 } });
		const nolan = () =>
			call('POST', '/api/learn/nolan/done', { today: TODAY, game: 'apples', level: 5, rounds: 3, firstTry: 3 });
		await nolan();
		await nolan();
		expect(sent).toEqual([]);
		expect((await nolan()).json().leveledUp).toBe(false);
		// Once: more plays while it waits don't send it again.
		await nolan();
		await settle();
		expect(sent).toEqual([{ to: 'https://push.test/alex', title: '🌱 Nolan is ready for level 6 of Counting' }]);

		sent.length = 0;
		await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true, levels: { letters: 5 } });
		const tayen = () =>
			call('POST', '/api/learn/tayen/done', { today: TODAY, game: 'letters', level: 5, rounds: 3, firstTry: 3 });
		await tayen();
		await tayen();
		expect(sent).toEqual([]);
		expect((await tayen()).json().leveledUp).toBe(true);
		await settle();
		expect(sent).toEqual([{ to: 'https://push.test/alex', title: '🌱 Tayen has reached the top of Letters' }]);
	});
});
