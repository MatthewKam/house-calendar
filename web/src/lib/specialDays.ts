// Special days for kid mode's Today: holidays and fun days (the ones that move worked out each year),
// family birthdays, and days a grown-up adds, with a countdown in sleeps.

import { dayKey, fromDayKey } from "./dates";

export interface SpecialDay {
	/** YYYY-MM-DD. */
	day: string;
	name: string;
	picture: string;
}

/** The nth weekday (0 Sunday … 6 Saturday) of a month (0-based); n = -1 for the last. */
function nth(year: number, month: number, weekday: number, n: number) {
	if (n < 0) {
		const last = new Date(year, month + 1, 0);
		return new Date(year, month, last.getDate() - ((last.getDay() - weekday + 7) % 7));
	}
	const first = new Date(year, month, 1);
	return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
}

/** Easter Sunday (the Gregorian computus). */
function easter(year: number) {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return new Date(year, month - 1, day);
}

/** A year's holidays and fun days: the big US ones, the school days off, the seasons, and a few kid favourites. */
export function holidays(year: number): SpecialDay[] {
	const on = (month: number, day: number) => new Date(year, month, day);
	const list: [Date, string, string][] = [
		[on(0, 1), "New Year's Day", "🎆"],
		[nth(year, 0, 1, 3), "Martin Luther King Jr. Day", "🕊️"],
		[on(1, 14), "Valentine's Day", "💝"],
		[nth(year, 1, 1, 3), "Presidents' Day", "🇺🇸"],
		[on(2, 17), "St. Patrick's Day", "☘️"],
		[on(2, 20), "First day of spring", "🌷"],
		[easter(year), "Easter", "🐣"],
		[on(3, 22), "Earth Day", "🌍"],
		[nth(year, 4, 0, 2), "Mother's Day", "💐"],
		[nth(year, 4, 1, -1), "Memorial Day", "🇺🇸"],
		[nth(year, 5, 0, 3), "Father's Day", "👔"],
		[on(5, 21), "First day of summer", "☀️"],
		[on(6, 4), "Fourth of July", "🎆"],
		[nth(year, 8, 1, 1), "Labor Day", "🛠️"],
		[on(8, 22), "First day of fall", "🍂"],
		[on(9, 31), "Halloween", "🎃"],
		[on(10, 11), "Veterans Day", "🎖️"],
		[nth(year, 10, 4, 4), "Thanksgiving", "🦃"],
		[on(11, 21), "First day of winter", "⛄"],
		[on(11, 24), "Christmas Eve", "🎄"],
		[on(11, 25), "Christmas", "🎁"],
		[on(11, 31), "New Year's Eve", "🎉"],
	];
	return list.map(([date, name, picture]) => ({ day: dayKey(date), name, picture }));
}

/** Each person's birthday in a year, from their birthdate (YYYY-MM-DD). */
export function birthdays(people: { name: string; birthdate: string | null }[], year: number): SpecialDay[] {
	return people.flatMap((p) => {
		if (!p.birthdate) return [];
		const [, m, d] = p.birthdate.split("-").map(Number);
		// Born on 29 February: the 28th in other years.
		const date = new Date(year, m - 1, d);
		if (date.getMonth() !== m - 1) date.setDate(0);
		return [{ day: dayKey(date), name: `${p.name.split(" ")[0]}'s birthday`, picture: "🎂" }];
	});
}

/** The days a grown-up added, in a year: the once-only ones that fall in it, the yearly ones moved to it. */
export function addedDays(days: { day: string; name: string; picture: string; yearly: boolean }[], year: number): SpecialDay[] {
	return days.flatMap((d) => {
		if (!d.yearly) return d.day.startsWith(`${year}-`) ? [{ day: d.day, name: d.name, picture: d.picture }] : [];
		const [, m, dd] = d.day.split("-").map(Number);
		const date = new Date(year, m - 1, dd);
		if (date.getMonth() !== m - 1) date.setDate(0);
		return [{ day: dayKey(date), name: d.name, picture: d.picture }];
	});
}

/** How many sleeps from one day to another (YYYY-MM-DD). */
export function sleepsUntil(today: string, day: string) {
	return Math.round((fromDayKey(day).getTime() - fromDayKey(today).getTime()) / 86_400_000);
}

/**
 * This month's special days, in order; in the month's last week, next month's first two weeks too (so
 * the next ones don't vanish when the month turns over). `extra` adds birthdays and grown-ups' own days.
 */
export function specialDaysFor(today: string, extra: (year: number) => SpecialDay[] = () => []) {
	const now = fromDayKey(today);
	const from = dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
	const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	const lastWeek = monthEnd.getDate() - now.getDate() < 7;
	const to = dayKey(lastWeek ? new Date(now.getFullYear(), now.getMonth() + 1, 14) : monthEnd);
	const years = [now.getFullYear(), now.getFullYear() + 1];
	return years
		.flatMap((y) => [...holidays(y), ...extra(y)])
		.filter((d) => d.day >= from && d.day <= to)
		.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
}
