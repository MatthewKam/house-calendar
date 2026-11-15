// Moments and the goal list: what the server takes and gives back, written once (server/moments.ts,
// server/goals.ts). The server checks requests against these and the web app imports their types
// (types only, so zod stays out of its bundle).

import { z } from 'zod';
import { Stage } from './stages.ts';

/** A day, YYYY-MM-DD. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The six activities moments and goals are grouped by: what a parent catches or a kid works on. */
export const Activity = z.enum(['helpful', 'attitude', 'bravery', 'cleanliness', 'problem_solving', 'self_care']);

/** Moments between two local days, end exclusive (GET /api/moments). */
export const MomentRange = z.object({ from: day, to: day });

/** A new moment (POST /api/moments): which kid, which activity, and how many stars (1 if left out). */
export const MomentInput = z.strictObject({
	memberId: z.string(),
	kind: Activity,
	note: z.string().max(300).optional(),
	/** Local day it happened. */
	day,
	/** 0 is a sticker and a cheer, with nothing to save up. */
	stars: z.int().min(0).max(20).default(1),
});

/** Something good a parent caught a kid doing, as the server gives it back. */
export const Moment = z.object({
	id: z.string(),
	memberId: z.string(),
	kind: Activity,
	note: z.string().nullable(),
	/** What it earned, as the parent picked: 0 is just a sticker. */
	stars: z.int(),
	/** Local day, YYYY-MM-DD. */
	day: z.string(),
	createdAt: z.string(),
});

/** A parent's own goal for the list (POST /api/goals/library); the same name again is the same goal. */
export const OwnGoalInput = z.strictObject({
	title: z.string().min(1).max(80),
	emoji: z.string().min(1).max(16),
	kind: Activity,
});

/** Hiding a goal the family won't use, or showing it again (PUT /api/goals/library and /:key for one). */
export const GoalHidden = z.strictObject({ hidden: z.boolean() });

/** A goal in the list as the server gives it back. */
export const GoalTemplate = z.object({
	key: z.string(),
	title: z.string(),
	emoji: z.string(),
	kind: Activity,
	/** The ages it suits; empty for any age (a parent's own). */
	stages: z.array(Stage),
	/** One the family wrote. */
	own: z.boolean(),
	hidden: z.boolean(),
});

export type Activity = z.infer<typeof Activity>;
/** A new moment with every field there but the note (what the server has once the stars are filled in). */
export type MomentInput = z.output<typeof MomentInput>;
/** A new moment as the web app sends it: stars left out are 1. */
export type NewMoment = z.input<typeof MomentInput>;
export type Moment = z.infer<typeof Moment>;
export type OwnGoalInput = z.infer<typeof OwnGoalInput>;
export type GoalTemplate = z.infer<typeof GoalTemplate>;
