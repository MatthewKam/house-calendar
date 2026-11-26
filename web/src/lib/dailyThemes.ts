// Themes for the daily cards (the quote of the day and the grown-ups' encouragement): every one is on until
// it's switched off in Settings, Daily cards, apart from the parenting ones in a home with no kids. Each
// person keeps their own for Today; the wall and the calendar page have the family's.

import { ofTheDay } from './kidFacts';
import { isKid } from './people';
import { useMembers, useSetSetting, useSettings } from './queries';

/** A theme and what's in it. */
export interface Theme<T> {
	id: string;
	name: string;
	/** About bringing up kids: off to begin with in a home without any. */
	forParents?: true;
	items: T[];
}

/** Which card. */
export type DailyCard = 'quote' | 'encouragement';

/** Whose themes: the wall's (the family's, for the calendar page and the wall), or a person's own. */
export const WALL = 'wall';

/** The setting with the themes switched off, as a list of ids (unset: the ones off to begin with). */
export const themesKey = (card: DailyCard, whose: string) => `${card}ThemesOff.${whose}`;

/** The themes off until someone says otherwise: the parenting ones, in a home without kids. */
export const offAtFirst = <T>(themes: Theme<T>[], hasKids: boolean) =>
	hasKids ? [] : themes.filter((t) => t.forParents).map((t) => t.id);

/** The themes switched off, from what's saved (anything else: the ones off to begin with). */
export const themesOff = <T>(themes: Theme<T>[], saved: unknown, hasKids: boolean): string[] =>
	Array.isArray(saved) ? themes.filter((t) => saved.includes(t.id)).map((t) => t.id) : offAtFirst(themes, hasKids);

/** The themes in use. With every one switched off, the card would be empty, so then it's the usual ones. */
export function themesOn<T>(themes: Theme<T>[], off: string[], hasKids: boolean): Theme<T>[] {
	const on = themes.filter((t) => !off.includes(t.id));
	if (on.length) return on;
	const usual = themes.filter((t) => !offAtFirst(themes, hasKids).includes(t.id));
	return usual.length ? usual : themes;
}

/** The day's pick (YYYY-MM-DD) from these themes, and which theme it's from: the same all day. */
export function pickOfTheDay<T>(themes: Theme<T>[], day: string): { item: T; theme: Theme<T> } {
	return ofTheDay(
		themes.flatMap((theme) => theme.items.map((item) => ({ item, theme }))),
		day,
	);
}

/**
 * One card's themes for someone (or the wall): the ones in use, the ones switched off, and switching one
 * (null `whose`: no one's, so the usual ones and no switching).
 */
export function useDailyThemes<T>(themes: Theme<T>[], card: DailyCard, whose: string | null) {
	const settings = useSettings();
	const members = useMembers().data ?? [];
	const save = useSetSetting();
	const hasKids = members.some(isKid);
	const key = whose && themesKey(card, whose);
	const off = themesOff(themes, key ? settings.data?.[key] : undefined, hasKids);
	return {
		/** Settings are in: until then the pick could change once they come. */
		ready: !settings.isPending,
		on: themesOn(themes, off, hasKids),
		off,
		turn: key
			? (id: string, on: boolean) =>
					save.mutate({ key, value: on ? off.filter((o) => o !== id) : [...off.filter((o) => o !== id), id] })
			: undefined,
		/** Every theme on, or every one off. */
		turnAll: key ? (on: boolean) => save.mutate({ key, value: on ? [] : themes.map((t) => t.id) }) : undefined,
	};
}
