import type { Ingredient, Member } from './types';

// Allergies (each person's, in Settings → Family) and the words in a recipe that usually mean them, so a
// recipe can flag "⚠ Nolan: peanuts". A help, not a guarantee: a recipe's words can't say what's in a
// store-bought sauce, or what a kitchen shares.

interface Allergy {
	/** As kept on a person ("peanuts"), and shown. */
	name: string;
	emoji: string;
	/** Words that usually mean it (a plural s is fine). */
	words: string[];
	/** Phrases that look like it but aren't (coconut milk isn't milk). */
	not?: string[];
}

/** The common ones, to tap in Settings; anything else is matched by its own words. */
export const COMMON_ALLERGIES: Allergy[] = [
	{ name: 'peanuts', emoji: '🥜', words: ['peanut', 'groundnut', 'satay'] },
	{
		name: 'tree nuts',
		emoji: '🌰',
		words: [
			'almond',
			'cashew',
			'walnut',
			'pecan',
			'pistachio',
			'hazelnut',
			'macadamia',
			'brazil nut',
			'pine nut',
			'praline',
			'marzipan',
			'nutella',
			'pesto',
		],
	},
	{
		name: 'milk',
		emoji: '🥛',
		words: [
			'milk',
			'butter',
			'cheese',
			'cream',
			'yogurt',
			'yoghurt',
			'ghee',
			'whey',
			'casein',
			'parmesan',
			'mozzarella',
			'cheddar',
			'ricotta',
			'feta',
			'paneer',
			'custard',
			'half-and-half',
		],
		not: [
			'coconut milk',
			'almond milk',
			'oat milk',
			'soy milk',
			'rice milk',
			'peanut butter',
			'almond butter',
			'nut butter',
			'cocoa butter',
			'apple butter',
			'cream of tartar',
			'coconut cream',
			'butternut',
			'butter bean',
		],
	},
	{ name: 'egg', emoji: '🥚', words: ['egg', 'mayonnaise', 'mayo', 'meringue', 'aioli'], not: ['eggplant'] },
	{
		name: 'wheat',
		emoji: '🌾',
		words: [
			'wheat',
			'flour',
			'bread',
			'breadcrumb',
			'panko',
			'pasta',
			'spaghetti',
			'macaroni',
			'penne',
			'noodle',
			'couscous',
			'tortilla',
			'soy sauce',
			'barley',
			'rye',
			'semolina',
			'cracker',
			'bulgur',
			'farro',
			'seitan',
			'udon',
			'ramen',
			'pita',
			'bun',
			'dumpling wrapper',
		],
		not: [
			'rice flour',
			'almond flour',
			'coconut flour',
			'corn tortilla',
			'rice noodle',
			'glass noodle',
			'gluten-free',
			'buckwheat',
		],
	},
	{ name: 'soy', emoji: '🫘', words: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh', 'tamari'] },
	{ name: 'sesame', emoji: '⚪', words: ['sesame', 'tahini', 'furikake'] },
	{
		name: 'fish',
		emoji: '🐟',
		words: [
			'fish',
			'salmon',
			'tuna',
			'cod',
			'tilapia',
			'anchovy',
			'anchovies',
			'sardine',
			'halibut',
			'trout',
			'mahi',
			'snapper',
			'worcestershire',
			'bonito',
			'dashi',
		],
		not: ['shellfish'],
	},
	{
		name: 'shellfish',
		emoji: '🦐',
		words: [
			'shrimp',
			'prawn',
			'crab',
			'lobster',
			'scallop',
			'clam',
			'mussel',
			'oyster',
			'crawfish',
			'crayfish',
			'squid',
			'calamari',
			'octopus',
			'shellfish',
		],
	},
];

/** The common one by name, else one of their own (its own word, and its plural). */
const allergyNamed = (name: string): Allergy =>
	COMMON_ALLERGIES.find((a) => a.name === name) ?? {
		name,
		emoji: '⚠️',
		// One word, the way it'd be written for one (strawberries: strawberry).
		words: [name.endsWith('ies') ? `${name.slice(0, -3)}y` : name.replace(/s$/, '')],
	};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a line of a recipe has the allergy in it. */
export function mentions(text: string, name: string) {
	const a = allergyNamed(name);
	let line = ` ${text.toLowerCase()} `;
	for (const n of a.not ?? []) line = line.split(n).join(' ');
	// Each word as written, or more than one (berry: berries; dish: dishes).
	return a.words.some((w) => {
		const many = w.endsWith('y') ? `|${escape(w.slice(0, -1))}ies` : '';
		return new RegExp(`(^|[^a-z])(${escape(w)}(e?s)?${many})([^a-z]|$)`).test(line);
	});
}

/** An ingredient as one line of words, for matching. */
const words = (i: Ingredient) => [i.unit, i.item, i.group].filter(Boolean).join(' ');

/** For each person with allergies: the ones this recipe's ingredients mention, and which ingredients (by place). */
export function flags(ingredients: Ingredient[], people: Pick<Member, 'id' | 'name' | 'allergies'>[]) {
	return people.flatMap((p) => {
		const hits = p.allergies
			.map((name) => ({ name, rows: ingredients.flatMap((i, n) => (mentions(words(i), name) ? [n] : [])) }))
			.filter((h) => h.rows.length > 0);
		return hits.length ? [{ person: p, allergies: hits }] : [];
	});
}

/** The emoji for an allergy, common or their own. */
export const allergyEmoji = (name: string) => allergyNamed(name).emoji;
