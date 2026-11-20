// A day's plans (server/dayPlans.ts): a note and a list the grown-ups share, on any day of the
// calendar or on a special day every year. What the routes take and give back, written once.

import { z } from 'zod';
import { ChecklistInput } from './events.ts';

/**
 * Whose plans: one day (date:YYYY-MM-DD), or a special day every year (its key in specialDays.ts:
 * holiday:<name>, birthday:<person's id> or event:<title>). Reminders (specialReminders.ts) use the same
 * keys, and an event's too: series:<calendar id>:<series> (every time it repeats; CalEvent's planKey).
 */
export const PLAN_KEY = /^(date:\d{4}-\d{2}-\d{2}|(holiday|birthday|event|series):.+)$/;
// Room for an iCloud event's key: its calendar's address and the event's id are long (over 200 between them).
export const PlanKey = z.string().max(1000).regex(PLAN_KEY);

/** One day's key. */
export const dateKey = (day: string) => `date:${day}`;
/** The day a one-day key is for (YYYY-MM-DD), or null for a special day's. */
export const dateOfKey = (key: string) => (key.startsWith('date:') ? key.slice(5) : null);

/** A thing on a day's list, with the days it was ticked (each year starts fresh). */
export const DayListItem = z.object({
	id: z.string(),
	title: z.string(),
	picture: z.string().nullable(),
	ticked: z.array(z.string()),
});

/** Every day's plans, by key (GET /api/day-plans; each change answers with them too). */
export const DayPlans = z.object({
	notes: z.record(z.string(), z.string()),
	lists: z.record(z.string(), z.array(DayListItem)),
});

/** A day's note (PUT /api/day-plans/:key/note); empty takes it off. */
export const DayNoteInput = z.strictObject({ note: z.string().max(2000) });
/** A day's list, in order (PUT /api/day-plans/:key/list): the same shape as an event's. */
export const DayListInput = ChecklistInput;
/** Ticked or not, on one day (PUT /api/day-plans/:key/list/:itemId). */
export const DayTick = z.strictObject({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), done: z.boolean() });

export type DayListItem = z.infer<typeof DayListItem>;
export type DayPlans = z.infer<typeof DayPlans>;
export type DayTick = z.infer<typeof DayTick>;
