import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';
import { prepReminders } from './meals.ts';
import type { RecipeFields } from '../shared/recipes.ts';

const TZ = 'America/Los_Angeles';
// Thursday, January 10, 2030 (8 hours behind UTC).
const THURSDAY = '2030-01-10';

const BULGOGI: RecipeFields = {
	title: 'Bulgogi',
	servings: 4,
	totalMinutes: 40,
	activeMinutes: 20,
	ingredients: [{ group: null, amount: 1.5, unit: 'lb', item: 'ribeye, thinly sliced' }],
	steps: ['Marinate the beef.', 'Sear in a hot pan.'],
	notes: null,
	prepAhead: [
		{ what: 'Marinate the beef', hoursBefore: 12 },
		{ what: 'Thaw the ribeye in the fridge.', hoursBefore: 24 },
	],
	proteins: ['beef'],
	vegetables: [],
	types: ['korean'],
	meal: 'dinner',
	sourceUrl: null,
};

describe('prep reminders', () => {
	it('come at the meal time less how long ahead, out of the night, saying for when', () => {
		const at = (what: string, hoursBefore: number, meal: 'breakfast' | 'dinner' = 'dinner') =>
			prepReminders('Bulgogi', [{ what, hoursBefore }], THURSDAY, meal, TZ)[0];
		// 4 hours before dinner at 6: 2 PM that day.
		expect(at('Marinate the beef', 4)).toEqual({
			title: 'Marinate the beef for today’s dinner (Bulgogi)',
			due: '2030-01-10T22:00:00.000Z',
		});
		// Overnight would be 6 AM: 8 PM the evening before instead.
		expect(at('Marinate the beef', 12)).toEqual({
			title: 'Tonight: marinate the beef for tomorrow’s dinner (Bulgogi)',
			due: '2030-01-10T04:00:00.000Z',
		});
		// A day ahead: 6 PM the day before. Two days: by the day's name.
		expect(at('Thaw the ribeye.', 24)).toMatchObject({ due: '2030-01-10T02:00:00.000Z' });
		expect(at('Thaw the ribeye', 48).title).toBe('Tonight: thaw the ribeye for Thursday’s dinner (Bulgogi)');
		// Ten hours before breakfast at 8 is 10 PM: 8 PM instead.
		expect(at('Make the batter', 10, 'breakfast').due).toBe('2030-01-10T04:00:00.000Z');
		// Nothing ahead, nothing to remind.
		expect(prepReminders('Bulgogi', [{ what: 'Rest', hoursBefore: 0 }], THURSDAY, 'dinner', TZ)).toEqual([]);
	});
});

describe('planned meals', () => {
	it('put a recipe on a day with its prep on To do, moved and taken off with it', async () => {
		const { call } = household();
		const recipeId = (await call('POST', '/api/recipes', { recipe: BULGOGI, images: [], cover: null })).body.id;
		const plan = { day: THURSDAY, meal: 'dinner', recipeId, timeZone: TZ };
		expect((await call('POST', '/api/meals', { ...plan, timeZone: 'Mars/Base' })).status).toBe(400);
		expect((await call('POST', '/api/meals', { ...plan, recipeId: 'nope' })).status).toBe(404);

		const made = await call('POST', '/api/meals', plan);
		expect(made.status).toBe(201);
		const [meal] = made.body.meals;
		expect(meal).toMatchObject({ day: THURSDAY, meal: 'dinner', recipeId });
		// Thawing first (6 PM Wednesday), then marinating (8 PM Wednesday).
		expect(meal.reminders.map((r: { due: string }) => r.due)).toEqual([
			'2030-01-10T02:00:00.000Z',
			'2030-01-10T04:00:00.000Z',
		]);
		// They're To do items (the list made for them), with a when.
		const lists = (await call('GET', '/api/lists')).body;
		expect(lists.map((l: { title: string }) => l.title)).toEqual(['To do']);
		expect(lists[0].items).toHaveLength(2);

		// Friday instead: the reminders move a day.
		const moved = (await call('PUT', `/api/meals/${meal.id}`, { day: '2030-01-11', meal: 'dinner', timeZone: TZ })).body
			.meals[0];
		expect(moved.reminders[0].due).toBe('2030-01-11T02:00:00.000Z');
		expect((await call('GET', '/api/lists')).body[0].items).toHaveLength(2);

		// Off the plan: its reminders go too.
		expect((await call('DELETE', `/api/meals/${meal.id}`)).body.meals).toEqual([]);
		expect((await call('GET', '/api/lists')).body[0].items).toEqual([]);

		// Times changed in the app, or reminders off: kept as sent.
		const custom = [{ title: 'Thaw it', due: '2030-01-09T17:00:00.000Z' }];
		const chosen = (await call('POST', '/api/meals', { ...plan, reminders: custom })).body.meals[0];
		expect(chosen.reminders).toMatchObject(custom);
		const none = (
			await call('PUT', `/api/meals/${chosen.id}`, { day: THURSDAY, meal: 'dinner', timeZone: TZ, reminders: [] })
		).body.meals[0];
		expect(none.reminders).toEqual([]);
		expect((await call('POST', '/api/meals', { ...plan, reminders: [{ title: 'x', due: 'soon' }] })).status).toBe(400);
		await call('DELETE', `/api/meals/${chosen.id}`);

		// A recipe deleted takes its plans (and their reminders) with it.
		await call('POST', '/api/meals', plan);
		await call('DELETE', `/api/recipes/${recipeId}`);
		expect((await call('GET', '/api/meals')).body.meals).toEqual([]);
		expect((await call('GET', '/api/lists')).body[0].items).toEqual([]);
	});

	it('keeps themed days, and planning is a parent’s', async () => {
		const { app, call } = household([{ id: 'kid', name: 'Kid' }]);
		let viewer: object | undefined = undefined;
		app.addHook('onRequest', async (req) => {
			req.raw.viewer = viewer as never;
		});
		const theme = { name: ' Pancake   Friday ', emoji: '🥞', weekday: 5, meal: 'breakfast', from: 'Pancakes' };
		const made = (await call('POST', '/api/meal-themes', theme)).body.themes;
		expect(made).toMatchObject([{ name: 'Pancake Friday', weekday: 5, meal: 'breakfast', from: 'pancakes' }]);
		const id = made[0].id;
		const changed = await call('PUT', `/api/meal-themes/${id}`, { ...theme, name: 'Waffle Wednesday', weekday: 3 });
		expect(changed.body.themes[0]).toMatchObject({ name: 'Waffle Wednesday', weekday: 3 });
		expect((await call('PUT', '/api/meal-themes/nope', theme)).status).toBe(404);

		// A kid's device sees the plan but doesn't change it.
		viewer = { role: 'kid', memberId: 'kid', parent: false, holder: false, actor: 'kid' };
		expect((await call('GET', '/api/meals')).body.themes).toHaveLength(1);
		expect((await call('DELETE', `/api/meal-themes/${id}`)).status).toBe(403);
		expect(
			(await call('POST', '/api/meals', { day: THURSDAY, meal: 'dinner', recipeId: 'x', timeZone: TZ })).status,
		).toBe(403);
	});
});
