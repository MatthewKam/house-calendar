// Plan ahead (docs/recipes.md): what's planned for a day, and what a themed day suggests.

import { addDays, dayKey, fromDayKey } from './dates';
import type { MealPlan, MealTheme, PlanMeal, Plans, Recipe } from './types';

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
