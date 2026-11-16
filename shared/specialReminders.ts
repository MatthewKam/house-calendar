// Reminders on special days, or on any one day (server/specialReminders.ts): what the routes take and
// give back, written once.

import { z } from 'zod';
import { PlanKey } from './dayPlans.ts';

/** How long before: on the day, 1, 2 or 3 days, or 1 or 2 weeks. */
export const DAYS_BEFORE = [0, 1, 2, 3, 7, 14] as const;
export const DaysBefore = z.union(DAYS_BEFORE.map((n) => z.literal(n)));

/** One of your reminders on a special day (GET /api/special-reminders gives yours). */
export const SpecialReminder = z.object({
	id: z.string(),
	key: z.string(),
	daysBefore: DaysBefore,
	/** What to do then ("Pick up a present"), or nothing: just the reminder. */
	note: z.string().nullable(),
});

/** A new one (POST /api/special-reminders); DELETE /api/special-reminders/:id takes one off. */
export const SpecialReminderNew = z.strictObject({
	key: PlanKey,
	name: z.string().min(1).max(200),
	daysBefore: DaysBefore,
	note: z.string().trim().max(200).nullable().optional(),
});

/** "On the day", "1 day before", "2 weeks before". */
export const beforeLabel = (n: number) =>
	n === 0
		? 'On the day'
		: n % 7 === 0
			? `${n / 7} week${n > 7 ? 's' : ''} before`
			: `${n} day${n > 1 ? 's' : ''} before`;

export type SpecialReminder = z.infer<typeof SpecialReminder>;
export type SpecialReminderNew = z.infer<typeof SpecialReminderNew>;
