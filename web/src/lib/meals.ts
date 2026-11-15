// Plan ahead (docs/recipes.md): what's planned for a day, and what a themed day suggests.

import { addDays, dayKey, fromDayKey } from './dates';
import type { MealPlan, MealTheme, PlanMeal, Plans, Recipe } from './types';
import { mealAt, prepAt, prepTitle } from '../../../shared/prepTimes.ts';

export const MEALS: { meal: PlanMeal; label: string; emoji: string }[] = [
	{ meal: 'breakfast', label: 'Breakfast', emoji: '🍳' },
	{ meal: 'lunch', label: 'Lunch', emoji: '🥪' },
	{ meal: 'dinner', label: 'Dinner', emoji: '🍽️' },
];
export const mealLabel = (m: PlanMeal) => MEALS.find((x) => x.meal === m)!.label;

/** Pictures for a themed day. */
export const THEME_EMOJI = ['🥞', '🧇', '🌮', '🍕', '🍝', '🍜', '🍲', '🍔', '🐟', '🥗', '🍛', '🍣'];

const order = (m: PlanMeal) => MEALS.findIndex((x) => x.meal === m);

/** What's planned on a day, breakfast first. */
export const plannedOn = (plans: Plans | undefined, day: string): MealPlan[] =>
	(plans?.meals ?? []).filter((m) => m.day === day).sort((a, b) => order(a.meal) - order(b.meal));

/** The themed days that fall on a day. */
export const themesOn = (plans: Plans | undefined, day: string): MealTheme[] =>
	(plans?.themes ?? []).filter((t) => t.weekday === fromDayKey(day).getDay());

/** "Today", "Tomorrow", or "Mon 17". */
export function dayWord(day: string, today: string) {
	if (day === today) return 'Today';
	if (day === dayKey(addDays(fromDayKey(today), 1))) return 'Tomorrow';
	return fromDayKey(day).toLocaleDateString([], { weekday: 'short', day: 'numeric' });
}

/** The next days from today, for picking a day. */
export const nextDays = (today: string, n = 7) =>
	Array.from({ length: n }, (_, i) => dayKey(addDays(fromDayKey(today), i)));

/** "pancakes" and "pancake" are one. */
const one = (w: string) =>
	w
		.toLowerCase()
		.trim()
		.replace(/(?<!s)s$/, '');

/** Whether a recipe fits a themed day: its kind, meal, protein or tag, or its name (Fluffy pancakes). */
export function fitsTheme(r: Recipe, from: string) {
	const want = one(from);
	return (
		[r.meal, ...r.proteins, ...r.types, ...r.tags].some((k) => one(k) === want) ||
		r.title
			.toLowerCase()
			.split(/\W+/)
			.some((w) => w && one(w) === want)
	);
}

/**
 * What a themed day suggests from the book: a recipe that fits, in turn week by week, not the one it was
 * last week; `another` steps on to the next (Another).
 */
export function suggestion(theme: MealTheme, recipes: Recipe[], plans: Plans | undefined, day: string, another = 0) {
	const fits = recipes.filter((r) => fitsTheme(r, theme.from)).sort((a, b) => a.id.localeCompare(b.id));
	if (!fits.length) return null;
	const lastWeek = dayKey(addDays(fromDayKey(day), -7));
	const last = plannedOn(plans, lastWeek).find((m) => m.meal === theme.meal)?.recipeId;
	const fresh = fits.length > 1 ? fits.filter((r) => r.id !== last) : fits;
	const week = Math.floor(fromDayKey(day).getTime() / (7 * 86_400_000));
	return fresh[(week + another) % fresh.length];
}

// Opening a recipe from elsewhere (the calendar, Today): the Recipes page opens with it.
let wanted: string | null = null;
export const askToOpen = (recipeId: string) => {
	wanted = recipeId;
};
export const takeWanted = () => {
	const id = wanted;
	wanted = null;
	return id;
};

// ---- Prep ahead's times, on this device's clock ---------------------------------------------------

/** This device's time zone: when "8 PM the evening before" is. */
export const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Each step ahead of a recipe planned for a day's meal, and when it starts (worked out as the server does). */
export const prepSteps = (r: Recipe, day: string, meal: PlanMeal) =>
	r.prepAhead
		.filter((p) => p.hoursBefore > 0)
		.map((p) => ({ what: p.what, at: prepAt(p.hoursBefore, day, meal, zone()) }));

/** The first day (of the next two weeks) whose prep hasn't started yet: the earliest it can be made. */
export function earliestDay(r: Recipe, meal: PlanMeal, now: number, today: string) {
	return nextDays(today, 14).find((d) => prepSteps(r, d, meal).every((p) => p.at > now)) ?? null;
}

/** "Fri 6 PM", "Today 8:30 PM". */
export function whenText(at: number, today: string) {
	const d = new Date(at);
	const day = dayKey(d) === today ? 'Today' : d.toLocaleDateString([], { weekday: 'short' });
	const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
	return `${day} ${time}`;
}

/** An instant as a date-and-time box's value: "2026-11-14T20:00". */
export const boxValue = (at: number) => {
	const d = new Date(at);
	return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export { mealAt, prepTitle };
