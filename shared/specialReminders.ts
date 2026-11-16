// Reminders on special days, any one day or an event (server/specialReminders.ts): what the routes take
// and give back, written once.

import { z } from 'zod';
import { addDayKey, dayKey, fromDayKey } from './days.ts';
import { PlanKey } from './dayPlans.ts';

/** How long before: a number of hours (an event with a time only), days, weeks or months. */
export const UNITS = ['hour', 'day', 'week', 'month'] as const;
export type Unit = (typeof UNITS)[number];
/** The most of each (the server looks this far ahead). */
export const MOST: Record<Unit, number> = { hour: 48, day: 60, week: 12, month: 12 };
export const Before = z.object({ amount: z.int().min(1).max(60), unit: z.enum(UNITS) });

/** One of your reminders (GET /api/special-reminders gives yours). */
export const SpecialReminder = z.object({
	id: z.string(),
	key: z.string(),
	/** How long before; null: on the day (at 8 in the morning). */
	before: Before.nullable(),
	/** What to do then ("Pick up a present"), or nothing: just the reminder. */
	note: z.string().nullable(),
});

/** A new one (POST /api/special-reminders); DELETE /api/special-reminders/:id takes one off. */
export const SpecialReminderNew = z.strictObject({
	key: PlanKey,
	name: z.string().min(1).max(200),
	before: Before.nullable(),
	note: z.string().trim().max(200).nullable().optional(),
});

export type Before = z.infer<typeof Before>;
export type SpecialReminder = z.infer<typeof SpecialReminder>;
export type SpecialReminderNew = z.infer<typeof SpecialReminderNew>;

const count = (n: number, unit: Unit) => `${n} ${unit}${n > 1 ? 's' : ''}`;

/** "On the day", "1 day before", "3 weeks before", "2 hours before". */
export const beforeLabel = (before: Before | null) =>
	before ? `${count(before.amount, before.unit)} before` : 'On the day';

/** For an alert: "today", "tomorrow", "in a week", "in 3 months", "in 2 hours". */
export function inLabel(before: Before | null) {
	if (!before) return 'today';
	const { amount, unit } = before;
	if (amount === 1) return unit === 'day' ? 'tomorrow' : `in ${unit === 'hour' ? 'an' : 'a'} ${unit}`;
	return `in ${count(amount, unit)}`;
}

/** The day a reminder comes on, for a day (YYYY-MM-DD); hours before come on the day itself. */
export function remindDay(day: string, before: Before | null) {
	if (!before || before.unit === 'hour') return day;
	if (before.unit !== 'month') return addDayKey(day, -before.amount * (before.unit === 'week' ? 7 : 1));
	// Months back, on the same date (the 31st becomes the month's last day).
	const d = fromDayKey(day);
	const back = new Date(d.getFullYear(), d.getMonth() - before.amount, 1);
	const last = new Date(back.getFullYear(), back.getMonth() + 1, 0).getDate();
	return dayKey(new Date(back.getFullYear(), back.getMonth(), Math.min(d.getDate(), last)));
}
