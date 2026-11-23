import { addDays, dayKey, fromDayKey, timeLabel } from './dates';

// A list item's when (server/lists.ts): YYYY-MM-DD for any time that day, or an instant.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (due: string) => DAY.test(due);

/** "Today", "Tomorrow 10:00 AM", "Fri, Nov 7". */
export function dueLabel(due: string, now = new Date()) {
	const day = isDay(due) ? due : dayKey(new Date(due));
	const today = dayKey(now);
	const name =
		day === today
			? 'Today'
			: day === dayKey(addDays(now, 1))
				? 'Tomorrow'
				: day === dayKey(addDays(now, -1))
					? 'Yesterday'
					: fromDayKey(day).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
	return isDay(due) ? name : `${name} ${timeLabel(due)}`;
}

/** Due now: its day has come (a day), or its time has passed (an instant). */
export const isDue = (due: string, now = new Date()) =>
	isDay(due) ? due <= dayKey(now) : Date.parse(due) <= now.getTime();
/** Late: a day before today, or a time already gone. */
export const isLate = (due: string, now = new Date()) =>
	isDay(due) ? due < dayKey(now) : Date.parse(due) < now.getTime();

/** The colors a list can be (Lists, ListView.tsx's swatches). */
export const LIST_COLORS = [
	'#f2dcb3',
	'#ecb0ea',
	'#c9dcf7',
	'#cdebd3',
	'#ddd3f5',
	'#f8cfb8',
	'#f6e7a1',
	'#c3ece4',
	'#e4e4e4',
];

/**
 * A list's color: the one picked for it (the listColors setting, by name), else the next in turn by its
 * place among all the lists (Sprig's, then Reminders'), as Lists and Today both show it.
 */
export const listColor = (title: string, index: number, picked: Record<string, string> = {}) =>
	picked[title.toLowerCase()] ?? LIST_COLORS[index % LIST_COLORS.length];
