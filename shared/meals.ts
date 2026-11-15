// Plan ahead (docs/recipes.md): a recipe on a day, themed days (Pancake Friday), and the prep reminders a
// planned recipe brings. What the server takes and gives back, written once (server/schemas.ts schemaOf);
// the web app imports the types only.

import { z } from 'zod';

/** The meals a recipe can be planned for. */
export const PlanMeal = z.enum(['breakfast', 'lunch', 'dinner']);
export type PlanMeal = z.infer<typeof PlanMeal>;

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** The device's time zone, so "8 PM the evening before" is the family's 8 PM. */
const TimeZone = z.string().min(1).max(64);

/** A recipe on a day (POST /api/meals). */
export const NewMealPlan = z.strictObject({
	day: Day,
	meal: PlanMeal,
	recipeId: z.string().min(1).max(64),
	timeZone: TimeZone,
});

/** Moved to another day or meal (PUT /api/meals/:id); its reminders move with it. */
export const MoveMealPlan = z.strictObject({
	day: Day,
	meal: PlanMeal,
	timeZone: TimeZone,
});

/** A themed day, new or changed (POST /api/meal-themes, PUT .../:id): every week, suggesting from a kind or tag. */
export const MealThemeFields = z.strictObject({
	name: z.string().min(1).max(40),
	emoji: z.string().min(1).max(16),
	/** 0 is Sunday. */
	weekday: z.int().min(0).max(6),
	meal: PlanMeal,
	/** A kind (pancakes, pasta, a cuisine, the meal), a protein or one of the family's tags. */
	from: z.string().min(1).max(40),
});
export type MealThemeFields = z.infer<typeof MealThemeFields>;

/** A planned recipe, with the prep reminders it put on To do. */
export interface MealPlan {
	id: string;
	day: string;
	meal: PlanMeal;
	recipeId: string;
	reminders: { id: string; title: string; due: string; done: boolean }[];
}

export interface MealTheme extends MealThemeFields {
	id: string;
}

/** Everything planned (from a while back on) and the themed days. */
export interface Plans {
	meals: MealPlan[];
	themes: MealTheme[];
}
