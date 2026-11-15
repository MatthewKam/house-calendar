import { describe, expect, it } from 'vitest';
import { offAtFirst, pickOfTheDay, themesOff, themesOn, type Theme } from './dailyThemes';
import { ENCOURAGEMENT_THEMES } from './grownUpWords';
import { QUOTE_THEMES } from './quotes';

const themes: Theme<string>[] = [
	{ id: 'parenting', name: 'Parenting', forParents: true, items: ['p1', 'p2'] },
	{ id: 'joy', name: 'Joy', items: ['j1'] },
	{ id: 'nature', name: 'Nature', items: ['n1', 'n2'] },
];
const ids = (list: Theme<string>[]) => list.map((t) => t.id);

describe('daily card themes', () => {
	it('starts with every theme on, apart from parenting in a home without kids', () => {
		expect(ids(themesOn(themes, themesOff(themes, undefined, true), true))).toEqual(['parenting', 'joy', 'nature']);
		expect(ids(themesOn(themes, themesOff(themes, undefined, false), false))).toEqual(['joy', 'nature']);
		expect(offAtFirst(themes, false)).toEqual(['parenting']);
	});

	it('follows what was switched off, once anything was', () => {
		expect(ids(themesOn(themes, themesOff(themes, ['joy'], true), true))).toEqual(['parenting', 'nature']);
		// Switched back on in a home without kids: it stays on.
		expect(ids(themesOn(themes, themesOff(themes, [], false), false))).toEqual(['parenting', 'joy', 'nature']);
		// Themes that are gone, and anything that isn't a list, are left out.
		expect(themesOff(themes, ['joy', 'old', 3], true)).toEqual(['joy']);
		expect(themesOff(themes, 'joy', true)).toEqual([]);
	});

	it('never leaves a card empty', () => {
		expect(ids(themesOn(themes, ['parenting', 'joy', 'nature'], true))).toEqual(['parenting', 'joy', 'nature']);
		expect(ids(themesOn(themes, ['parenting', 'joy', 'nature'], false))).toEqual(['joy', 'nature']);
	});

	it('picks the same one all day, from the themes on, and says which theme', () => {
		const on = themesOn(themes, ['parenting'], true);
		const pick = pickOfTheDay(on, '2026-11-15');
		expect(pickOfTheDay(on, '2026-11-15')).toEqual(pick);
		expect(['j1', 'n1', 'n2']).toContain(pick.item);
		expect(pick.theme.items).toContain(pick.item);
		const week = ['10', '11', '12', '13', '14', '15', '16'].map((d) => pickOfTheDay(on, `2026-11-${d}`).item);
		expect(new Set(week)).toEqual(new Set(['j1', 'n1', 'n2']));
	});

	it('has plenty in every theme, each said once', () => {
		for (const list of [QUOTE_THEMES, ENCOURAGEMENT_THEMES] as Theme<{ text: string }>[][]) {
			expect(new Set(ids(list as Theme<never>[])).size).toBe(list.length);
			for (const t of list) expect(t.items.length, t.name).toBeGreaterThanOrEqual(15);
			const texts = list.flatMap((t) => t.items.map((i) => i.text));
			expect(texts.filter((x, i) => texts.indexOf(x) !== i)).toEqual([]);
		}
		expect(QUOTE_THEMES.filter((t) => t.forParents).map((t) => t.name)).toEqual(['Parenting']);
		expect(ENCOURAGEMENT_THEMES.filter((t) => t.forParents).map((t) => t.name)).toEqual(['For parents']);
	});
});
