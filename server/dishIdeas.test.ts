import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';
import type { IdeasInput, SurpriseInput } from './dishIdeas.ts';

const RECIPE = {
	title: 'Bulgogi',
	servings: 4,
	totalMinutes: 40,
	activeMinutes: 20,
	ingredients: [],
	steps: [],
	notes: null,
	prepAhead: [],
	proteins: ['beef'],
	vegetables: [],
	types: ['korean'],
	meal: 'dinner',
	sourceUrl: null,
};
const idea = (name: string) => ({ name, emoji: '🍜', about: 'A dish.', minutes: 30, why: 'Something new.' });

describe('dish ideas', () => {
	it("tells Claude the book, its ratings and the household's allergies (no names), and never repeats", async () => {
		const asked: IdeasInput[] = [];
		const { call } = household([{ id: 'nolan', name: 'Nolan' }], {
			dishIdeas: async (input) => {
				asked.push(input);
				// One already in the book and one already shown come back too: they're left out.
				return [idea('Bulgogi'), idea('Chicken katsu'), idea('Pad see ew'), idea('Fish tacos')];
			},
		});
		await call('PATCH', '/api/members/nolan', { allergies: ['peanuts'] });
		const id = (await call('POST', '/api/recipes', { recipe: RECIPE, images: [], cover: null })).body.id;
		await call('PUT', `/api/recipes/${id}/ratings/nolan`, { stars: 5 });

		const res = await call('POST', '/api/recipes/ideas', {
			time: '30 min',
			kind: null,
			ask: 'kid friendly',
			seen: ['Fish tacos'],
		});
		expect(res.body.ideas.map((i: { name: string }) => i.name)).toEqual(['Chicken katsu', 'Pad see ew']);
		expect(asked[0]).toEqual({
			book: [{ title: 'Bulgogi', kinds: ['dinner', 'beef', 'korean'], rating: 5 }],
			allergies: ['peanuts'],
			time: '30 min',
			kind: null,
			ask: 'kid friendly',
			seen: ['Fish tacos'],
		});
		expect(JSON.stringify(asked[0])).not.toContain('Nolan');
	});

	it('Surprise me: one dish for the weather, from the book or new by chance, never one already picked', async () => {
		const asked: SurpriseInput[] = [];
		let chance = 0.1;
		const { call } = household([{ id: 'nolan', name: 'Nolan' }], {
			random: () => chance,
			surprise: async (input) => {
				asked.push(input);
				return input.from === 'book'
					? { ...idea(input.book[0].title), recipeId: input.book[0].id, why: 'Cold out: something warm' }
					: { ...idea('Chicken tortilla soup'), recipeId: null };
			},
		});
		await call('PATCH', '/api/members/nolan', { allergies: ['peanuts'] });
		const id = (await call('POST', '/api/recipes', { recipe: RECIPE, images: [], cover: null })).body.id;
		const ask = { time: null, kind: null, ask: null, weather: 'Feels like 48°F, rain likely', seen: [] as string[] };

		// Low chance: from the book, with the recipe's id to open.
		const fromBook = (await call('POST', '/api/recipes/surprise', ask)).body.pick;
		expect(fromBook).toMatchObject({ name: 'Bulgogi', recipeId: id, why: 'Cold out: something warm' });
		expect(asked[0]).toMatchObject({
			from: 'book',
			book: [{ id, title: 'Bulgogi', kinds: ['dinner', 'beef', 'korean'], rating: null, minutes: 40 }],
			allergies: ['peanuts'],
			weather: 'Feels like 48°F, rain likely',
		});
		expect(JSON.stringify(asked[0])).not.toContain('Nolan');

		// High chance: something new, to search for.
		chance = 0.9;
		expect((await call('POST', '/api/recipes/surprise', ask)).body.pick).toMatchObject({
			name: 'Chicken tortilla soup',
			recipeId: null,
		});
		// The book's one already picked: new, whatever the chance.
		chance = 0.1;
		await call('POST', '/api/recipes/surprise', { ...ask, seen: ['Bulgogi'] });
		expect(asked[2].from).toBe('new');
	});

	it('Surprise me: a "new" dish that is in the book is that recipe; an id that isn\'t there is none', async () => {
		let answer = { ...idea('bulgogi'), recipeId: null as string | null };
		const { call } = household([], { random: () => 0.9, surprise: async () => answer });
		const id = (await call('POST', '/api/recipes', { recipe: RECIPE, images: [], cover: null })).body.id;
		const ask = { time: null, kind: null, ask: null, weather: null, seen: [] };
		expect((await call('POST', '/api/recipes/surprise', ask)).body.pick).toMatchObject({
			name: 'Bulgogi',
			recipeId: id,
		});
		answer = { ...idea('Fish tacos'), recipeId: 'made-up' };
		expect((await call('POST', '/api/recipes/surprise', ask)).body.pick).toMatchObject({ recipeId: null });
	});

	it('says so when ideas are off', async () => {
		const { call } = household();
		expect((await call('POST', '/api/recipes/ideas', { time: null, kind: null, ask: null, seen: [] })).status).toBe(
			503,
		);
		expect(
			(await call('POST', '/api/recipes/surprise', { time: null, kind: null, ask: null, weather: null, seen: [] }))
				.status,
		).toBe(503);
	});
});
