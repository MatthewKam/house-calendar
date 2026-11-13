import { describe, expect, it } from 'vitest';
import { amountText, ingredientLine, ingredientsText, minutesText, parseIngredients } from './recipes';

describe('recipe amounts', () => {
	it('writes amounts as a cook would, scaled', () => {
		expect([amountText(1.5), amountText(0.333), amountText(2), amountText(0.25 * 2), amountText(2.4)]).toEqual([
			'1 ½',
			'⅓',
			'2',
			'½',
			'2.4',
		]);
		const soy = { group: null, amount: 0.25, unit: 'cup', item: 'soy sauce' };
		expect([
			ingredientLine(soy),
			ingredientLine(soy, 2),
			ingredientLine({ ...soy, amount: null, unit: null, item: 'salt' }),
			// No amount (0 too): just the words, never "0".
			ingredientLine({ ...soy, amount: 0, unit: null, item: 'green onions, to serve' }),
		]).toEqual(['¼ cup soy sauce', '½ cup soy sauce', 'salt', 'green onions, to serve']);
	});

	it('reads typed lines back into amounts, with headings', () => {
		const typed =
			'For the marinade:\n1/4 cup soy sauce\n1 ½ tbsp sugar\n3 cloves garlic\n\nFor the beef:\n2 lb ribeye\n0 pepper\nsalt to taste';
		const list = parseIngredients(typed);
		expect(list).toEqual([
			{ group: 'For the marinade', amount: 0.25, unit: 'cup', item: 'soy sauce' },
			{ group: 'For the marinade', amount: 1.5, unit: 'tbsp', item: 'sugar' },
			{ group: 'For the marinade', amount: 3, unit: 'cloves', item: 'garlic' },
			{ group: 'For the beef', amount: 2, unit: 'lb', item: 'ribeye' },
			{ group: 'For the beef', amount: null, unit: null, item: 'pepper' },
			{ group: 'For the beef', amount: null, unit: null, item: 'salt to taste' },
		]);
		// And back to lines the same way.
		expect(parseIngredients(ingredientsText(list))).toEqual(list);
		expect([minutesText(25), minutesText(90), minutesText(120)]).toEqual(['25 min', '1 hr 30 min', '2 hr']);
	});
});
