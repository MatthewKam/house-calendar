import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';
import type { IdeasInput } from './dishIdeas.ts';

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

	it('says so when ideas are off', async () => {
		const { call } = household();
		expect((await call('POST', '/api/recipes/ideas', { time: null, kind: null, ask: null, seen: [] })).status).toBe(
			503,
		);
	});
});
