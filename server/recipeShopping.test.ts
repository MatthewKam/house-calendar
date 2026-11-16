import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';
import type { RecipeFields } from '../shared/recipes.ts';

const SOUP: RecipeFields = {
	title: 'Soup',
	servings: 4,
	totalMinutes: 30,
	activeMinutes: 10,
	ingredients: [
		{ group: null, amount: 1, unit: null, item: 'onion' },
		{ group: null, amount: 2, unit: 'cup', item: 'stock' },
	],
	steps: ['Cook it.'],
	notes: null,
	prepAhead: [],
	proteins: [],
	vegetables: ['onion'],
	types: [],
	meal: 'dinner',
	sourceUrl: null,
};

function setup() {
	const h = household(
		[
			{ id: 'mom', name: 'Mom' },
			{ id: 'dad', name: 'Dad' },
		],
		{ liveLists: { waitMs: 300, lookMs: 20 } },
	);
	let who = 'mom';
	h.app.addHook('onRequest', async (req) => {
		req.raw.viewer = {
			role: 'guardian',
			memberId: who,
			parent: true,
			holder: who === 'mom',
			actor: who,
			guardians: [],
			stillParent() {},
		};
	});
	return { ...h, as: (id: string) => (who = id) };
}

describe('shopping together from a recipe', () => {
	it('shares ticks, with who ticked each, only while someone is shopping', async () => {
		const { call, as } = setup();
		const recipe = (await call('POST', '/api/recipes', { recipe: SOUP, images: [], cover: null })).body;
		const at = `/api/recipes/${recipe.id}`;
		expect((await call('GET', `${at}/shopping`)).body).toEqual({ shopping: [], ticks: [] });
		// Not shopping: nothing to share a tick with.
		expect((await call('PUT', `${at}/ticks/0`, { done: true })).status).toBe(409);

		expect((await call('PUT', `${at}/shopping`, { on: true })).body.shopping).toEqual(['mom']);
		as('dad');
		expect((await call('PUT', `${at}/shopping`, { on: true })).body.shopping).toEqual(['mom', 'dad']);
		expect((await call('PUT', `${at}/ticks/1`, { done: true })).body.ticks).toEqual([{ index: 1, by: 'dad' }]);
		expect((await call('PUT', `${at}/ticks/x`, { done: true })).status).toBe(400);
		as('mom');
		expect((await call('PUT', `${at}/ticks/0`, { done: true })).body.ticks).toEqual([
			{ index: 0, by: 'mom' },
			{ index: 1, by: 'dad' },
		]);
		expect((await call('PUT', `${at}/ticks/1`, { done: false })).body.ticks).toEqual([{ index: 0, by: 'mom' }]);

		// Changing the recipe clears them (they go by each ingredient's place).
		await call('PUT', at, SOUP);
		expect((await call('GET', `${at}/shopping`)).body.ticks).toEqual([]);

		// Once no one's shopping, the ticks are gone, so the next trip starts fresh.
		await call('PUT', `${at}/ticks/0`, { done: true });
		await call('PUT', `${at}/shopping`, { on: false });
		as('dad');
		expect((await call('PUT', `${at}/shopping`, { on: false })).body).toEqual({ shopping: [], ticks: [] });
		expect((await call('PUT', `${at}/shopping`, { on: true })).body.ticks).toEqual([]);
	});

	it('answers live as soon as the other phone ticks', async () => {
		const { call, as } = setup();
		const recipe = (await call('POST', '/api/recipes', { recipe: SOUP, images: [], cover: null })).body;
		const at = `/api/recipes/${recipe.id}`;
		await call('PUT', `${at}/shopping`, { on: true });
		const first = (await call('GET', `${at}/shopping/live`)).body;
		expect(first).toMatchObject({ shopping: ['mom'], ticks: [] });

		const asked = Date.now();
		const waiting = call('GET', `${at}/shopping/live?stamp=${first.stamp}`);
		await new Promise((done) => setTimeout(done, 50));
		as('dad');
		await call('PUT', `${at}/shopping`, { on: true });
		const changed = (await waiting).body;
		expect(changed.shopping).toEqual(['mom', 'dad']);
		expect(Date.now() - asked).toBeLessThan(300);
		expect((await call('GET', '/api/recipes/nope/shopping/live')).status).toBe(404);
	});
});
