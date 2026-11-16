// Special days live in shared/ (the server sends their reminders); the app's code imports them from here.
import { dayKey } from './dates';
import type { CalEvent, Member } from './types';
import { birthdays, specialDaysBetween, specialEvent, type SpecialDay } from '../../../shared/specialDays.ts';

export * from '../../../shared/specialDays.ts';

/**
 * The special days from one day to another (YYYY-MM-DD, both in): holidays, the family's birthdays and
 * the events marked special (each once, on its first day), from the calendar's events for those days.
 */
export function specialDaysIn(from: string, to: string, people: Member[], events: CalEvent[]): SpecialDay[] {
	const special = events
		.filter((e) => e.special && !e.busy)
		.map((e) => specialEvent(e.allDay ? e.start : dayKey(new Date(e.start)), e.title))
		.filter((d, i, all) => all.findIndex((x) => x.day === d.day && x.name === d.name) === i);
	return specialDaysBetween(from, to, (year) => [
		...birthdays(people, year),
		...special.filter((d) => d.day.startsWith(`${year}-`)),
	]);
}
