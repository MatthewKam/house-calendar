import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { bucket } from './rewards.ts';
import { household } from './testing.ts';

const setup = () =>
	household([
		{ id: 'mia', name: 'Mia' },
		{ id: 'sam', name: 'Sam' },
	]);
type App = ReturnType<typeof buildApp>;
const library = async (app: App) =>
	(await app.inject({ url: '/api/goals/library' })).json() as {
		key: string;
		title: string;
		own: boolean;
		hidden: boolean;
		stages: string[];
	}[];
/** A goal on a kid's list: a task that isn't required, worth points. */
const addGoal = (app: App, memberId: string | null, title = 'Rides a bike', points = 5) =>
	app.inject({
		method: 'POST',
		url: '/api/tasks',
		payload: { title, memberId, days: [0, 1, 2, 3, 4, 5, 6], category: 'bonus', required: false, points },
	});

describe('goals', () => {
	it('are ticked any day for their points', async () => {
		const { db, app } = setup();
		const goal = (await addGoal(app, 'sam')).json();
		expect(goal).toMatchObject({ category: 'bonus', required: false, points: 5 });
		await app.inject({ method: 'PUT', url: `/api/tasks/${goal.id}/done/sam/2026-11-04` });
		await app.inject({ method: 'PUT', url: `/api/tasks/${goal.id}/done/sam/2026-11-05` });
		expect(bucket(db, 'sam')).toBe(10);
	});

	it("are five at most on a kid's list, counting ones for everyone", async () => {
		const { app } = setup();
		for (const t of ['a', 'b', 'c', 'd']) expect((await addGoal(app, 'sam', t)).statusCode).toBe(201);
		expect((await addGoal(app, null, 'shared')).statusCode).toBe(201);
		const sixth = await addGoal(app, 'sam', 'f');
		expect(sixth.statusCode).toBe(409);
		expect(sixth.json().error).toMatch(/5 goals/);
		// Mia has just the shared one; tasks don't count.
		expect((await addGoal(app, 'mia', 'g')).statusCode).toBe(201);
		expect(
			(
				await app.inject({
					method: 'POST',
					url: '/api/tasks',
					payload: { title: 'Brush teeth', memberId: 'sam', days: [1] },
				})
			).statusCode,
		).toBe(201);
		// A task changed into a goal counts too.
		const task = (
			await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Bed', memberId: 'sam', days: [1] } })
		).json();
		expect(
			(await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, payload: { category: 'bonus' } })).statusCode,
		).toBe(409);
	});

	it("keep a parent's own goal in the list for every kid, until it's hidden", async () => {
		const { app } = setup();
		const saved = await app.inject({
			method: 'POST',
			url: '/api/goals/library',
			payload: { title: 'Feeds the fish', emoji: '🐟', kind: 'helpful' },
		});
		expect(saved.statusCode).toBe(201);
		const own = saved.json();
		expect(own).toMatchObject({ title: 'Feeds the fish', own: true, stages: [], hidden: false });
		// The same name again is the same goal.
		await app.inject({
			method: 'POST',
			url: '/api/goals/library',
			payload: { title: 'feeds the fish', emoji: '🐟', kind: 'helpful' },
		});
		expect((await library(app)).filter((g) => g.own)).toHaveLength(1);
		await app.inject({
			method: 'PUT',
			url: `/api/goals/library/${encodeURIComponent(own.key)}`,
			payload: { hidden: true },
		});
		expect((await library(app)).find((g) => g.key === own.key)?.hidden).toBe(true);
	});

	it('hide and show, one at a time or all at once', async () => {
		const { app } = setup();
		expect((await library(app)).find((g) => g.key === 'bike')).toMatchObject({
			title: 'Rides a bike',
			stages: ['early'],
			hidden: false,
		});
		const hide = (key: string, hidden: boolean) =>
			app.inject({ method: 'PUT', url: `/api/goals/library/${key}`, payload: { hidden } });
		expect((await hide('feed-pet', true)).statusCode).toBe(204);
		expect((await library(app)).find((g) => g.key === 'feed-pet')?.hidden).toBe(true);
		await hide('feed-pet', false);
		expect((await library(app)).find((g) => g.key === 'feed-pet')?.hidden).toBe(false);
		expect((await hide('fly', true)).statusCode).toBe(404);
		const all = (hidden: boolean) => app.inject({ method: 'PUT', url: '/api/goals/library', payload: { hidden } });
		await all(true);
		expect((await library(app)).every((g) => g.hidden)).toBe(true);
		await all(false);
		expect((await library(app)).some((g) => g.hidden)).toBe(false);
	});

	it('turns extras and goals being worked on into daily goals, and keeps stars from finished ones', () => {
		const file = join(mkdtempSync(join(tmpdir(), 'sprig-')), 'old.db');
		const before = openDb(file, 34);
		before.prepare(`INSERT INTO members (id, name, color) VALUES ('sam', 'Sam', '#000000')`).run();
		before
			.prepare(
				`INSERT INTO tasks (id, title, member_id, days, category, required, points) VALUES
      ('chore', 'Feed the cat', 'sam', '0123456', 'chores', 0, 2), ('daily', 'Brush teeth', 'sam', '0123456', 'non_negotiable', 1, 0)`,
			)
			.run();
		before
			.prepare(
				`INSERT INTO goals (id, member_id, title, emoji, kind, started_day, points, done_day, stars) VALUES
      ('bike', 'sam', 'Rides a bike', '🚲', 'bravery', '2026-11-01', 5, NULL, 0),
      ('swim', 'sam', 'Swims', '🏊', 'bravery', '2026-10-01', 4, '2026-10-20', 4)`,
			)
			.run();
		before.close();
		const db = openDb(file);
		expect(db.prepare('SELECT id, category, required, points, icon FROM tasks ORDER BY id').all()).toEqual([
			{ id: 'bike', category: 'bonus', required: 0, points: 5, icon: '🚲' },
			{ id: 'chore', category: 'bonus', required: 0, points: 2, icon: null },
			{ id: 'daily', category: 'non_negotiable', required: 1, points: 0, icon: null },
		]);
		expect(bucket(db, 'sam')).toBe(4);
		db.close();
	});
});
