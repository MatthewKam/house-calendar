import { describe, expect, it } from 'vitest';
import { fresh, progressText, started, type RecipeProgress } from './recipeProgress';

const left = (p: Partial<RecipeProgress>): RecipeProgress => ({
	have: [],
	prepped: [],
	steps: [],
	scale: 1,
	cookingSince: null,
	timers: [],
	at: 0,
	...p,
});

describe('recipe progress', () => {
	it('counts a recipe as started with a box ticked or while cooking, not for the amount alone', () => {
		expect(started(left({ scale: 2 }))).toBe(false);
		expect(started(left({ have: [0] }))).toBe(true);
		expect(started(left({ steps: [1] }))).toBe(true);
		expect(started(left({ cookingSince: 5 }))).toBe(true);
	});

	it('forgets a recipe a day after its last change', () => {
		const hour = 60 * 60_000;
		const all = { soup: left({ at: 0 }), tacos: left({ at: 23 * hour }) };
		expect(Object.keys(fresh(all, 23.5 * hour))).toEqual(['soup', 'tacos']);
		expect(Object.keys(fresh(all, 24 * hour))).toEqual(['tacos']);
	});

	it('says how far along it is', () => {
		expect(progressText(left({ have: [0, 2, 3] }), 8, 5)).toBe('3 of 8 ingredients ticked');
		expect(progressText(left({ cookingSince: 1, steps: [0, 1] }), 8, 5)).toBe('Cooking · 2 of 5 steps');
		expect(progressText(left({ steps: [0] }), 8, 5)).toBe('1 of 5 steps ticked');
	});
});
