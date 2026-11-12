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
