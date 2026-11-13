import { describe, expect, it } from 'vitest';
import { flags, mentions } from './allergies';

describe('allergies in recipes', () => {
	it('finds the words that usually mean each one, and not the look-alikes', () => {
		expect(mentions('2 tbsp peanut butter', 'peanuts')).toBe(true);
		expect(mentions('2 tbsp peanut butter', 'milk')).toBe(false);
		expect(mentions('1 cup coconut milk', 'milk')).toBe(false);
		expect(mentions('½ cup heavy cream', 'milk')).toBe(true);
		expect(mentions('1 eggplant', 'egg')).toBe(false);
		expect(mentions('2 eggs, beaten', 'egg')).toBe(true);
		expect(mentions('¼ cup soy sauce', 'wheat')).toBe(true);
		expect(mentions('¼ cup soy sauce', 'soy')).toBe(true);
		expect(mentions('1 cup rice flour', 'wheat')).toBe(false);
		expect(mentions('8 corn tortillas', 'wheat')).toBe(false);
		expect(mentions('1 lb shrimp', 'shellfish')).toBe(true);
		expect(mentions('1 lb shrimp', 'fish')).toBe(false);
		expect(mentions('1 tbsp sesame oil', 'sesame')).toBe(true);
		expect(mentions('1 cup butternut squash', 'milk')).toBe(false);
		// Their own: the word and its plural.
		expect(mentions('1 cup strawberries, sliced', 'strawberries')).toBe(true);
		expect(mentions('1 strawberry', 'strawberries')).toBe(true);
	});

	it('says who, what, and which ingredients', () => {
		const ingredients = [
			{ group: 'For the marinade', amount: 0.25, unit: 'cup', item: 'soy sauce' },
			{ group: null, amount: 1, unit: 'tbsp', item: 'sesame oil' },
			{ group: null, amount: 1.5, unit: 'lb', item: 'ribeye' },
		];
		const people = [
			{ id: 'nolan', name: 'Nolan', allergies: ['sesame', 'peanuts'] },
			{ id: 'tayen', name: 'Tayen', allergies: [] },
			{ id: 'mom', name: 'Mom', allergies: ['wheat'] },
		];
		expect(flags(ingredients, people)).toEqual([
			{ person: people[0], allergies: [{ name: 'sesame', rows: [1] }] },
			{ person: people[2], allergies: [{ name: 'wheat', rows: [0] }] },
		]);
	});
});
