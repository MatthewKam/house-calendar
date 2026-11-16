// Cooking together (server/cook.ts): a link to a recipe that anyone can open to cook along, each
// with their own ticks and timers, everyone's progress seen by everyone. What the server takes and
// gives back, written once.

import { z } from 'zod';
import { RecipeFields } from './recipes.ts';

/** One person's timer: how long, when it rings, and what it's for ("Soup"), if they said. */
export const CookTimer = z.strictObject({
	id: z.number(),
	minutes: z.number().positive().max(10_000),
	endsAt: z.number(),
	name: z.string().max(40).nullable(),
});

/** One person's progress: when they started, what's prepped and which steps are done (by place), their timers, and whether they're done. */
export const CookProgress = z.strictObject({
	startedAt: z.number().nullable(),
	prepped: z.array(z.int().min(0).max(199)).max(200),
	steps: z.array(z.int().min(0).max(199)).max(200),
	timers: z.array(CookTimer).max(20),
	doneAt: z.number().nullable(),
});

/** How long the link lasts from now, in hours: a day by default, up to a week (a recipe over days). */
export const CookLength = z.strictObject({ hours: z.int().min(1).max(168) });

/**
 * Joining, or saying where you've got to (PUT /api/cook/:secret/me): this device's own id (kept on it),
 * the name to show (someone in the family is shown by their own), and the progress.
 */
export const CookMe = z.strictObject({
	cookId: z.string().min(8).max(64),
	name: z.string().min(1).max(40),
	progress: CookProgress,
});

/** Someone cooking along: who, in what colour, and how far they've got. */
export const CookPerson = z.object({
	cookId: z.string(),
	name: z.string(),
	color: z.string(),
	memberId: z.string().nullable(),
	progress: CookProgress,
	/** When they last said where they'd got to (ms). */
	seenAt: z.number(),
});

/** Who's cooking, and until when the link works (ms). */
export const CookStatus = z.object({ until: z.number(), people: z.array(CookPerson) });

/** The family's side (GET/POST /api/recipes/:id/cook): the link's secret (to share) and who's cooking; null: none going. */
export const CookRoom = CookStatus.extend({ secret: z.string() });

/** What the link opens (GET /api/cook/:secret): the recipe (its photos at the link's own addresses) and who's cooking. */
export interface CookAlong extends CookStatus {
	recipe: RecipeFields & { images: { url: string; step: number | null }[]; coverUrl: string | null };
}

export type CookTimer = z.infer<typeof CookTimer>;
export type CookProgress = z.infer<typeof CookProgress>;
export type CookLength = z.infer<typeof CookLength>;
export type CookMe = z.infer<typeof CookMe>;
export type CookPerson = z.infer<typeof CookPerson>;
export type CookStatus = z.infer<typeof CookStatus>;
export type CookRoom = z.infer<typeof CookRoom>;
export type LiveCook = CookStatus & { stamp: string };
