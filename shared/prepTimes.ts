// When a planned recipe's prep ahead happens (marinate overnight, thaw a day ahead): worked out once, for the
// server (the reminders it keeps) and the app (the times shown, to change before planning). No zod here:
// the web app imports this as code.

export type PlanMealName = 'breakfast' | 'lunch' | 'dinner';

/** When each meal usually is. */
export const MEAL_HOUR: Record<PlanMealName, number> = { breakfast: 8, lunch: 12, dinner: 18 };
/** Prep that would start in the night (from 9 PM to 7 AM) is moved to 8 PM the evening before. */
const NIGHT_FROM = 21;
const NIGHT_TO = 7;
const EVENING = 20;

/** The instant it's `hour`:`minute` on `day` (YYYY-MM-DD) in time zone `tz`. */
export function atLocal(day: string, hour: number, tz: string, minute = 0) {
	const [y, m, d] = day.split('-').map(Number);
	const guess = Date.UTC(y, m - 1, d, hour, minute);
	// How far the zone's clock is from UTC near then (worked out twice, for a day the clocks change).
	const offset = (t: number) => {
		const p = Object.fromEntries(
			new Intl.DateTimeFormat('en-US', {
				timeZone: tz,
				hourCycle: 'h23',
				year: 'numeric',
				month: 'numeric',
				day: 'numeric',
				hour: 'numeric',
				minute: 'numeric',
				second: 'numeric',
			})
				.formatToParts(t)
				.map((x) => [x.type, Number(x.value)]),
		);
		return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
	};
	const first = guess - offset(guess);
	return guess - offset(first);
}

/** The day (YYYY-MM-DD) and hour an instant falls on in time zone `tz`. */
export function localAt(t: number, tz: string) {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
		})
			.formatToParts(t)
			.map((x) => [x.type, x.value]),
	);
	return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** The day `n` days after `day` (YYYY-MM-DD). */
export const shiftDay = (day: string, n: number) => {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** When the meal is. */
export const mealAt = (day: string, meal: PlanMealName, tz: string) => atLocal(day, MEAL_HOUR[meal], tz);

/** When a step done `hoursBefore` the meal starts: the meal's time less that, out of the night. */
export function prepAt(hoursBefore: number, day: string, meal: PlanMealName, tz: string) {
	let t = mealAt(day, meal, tz) - hoursBefore * 3_600_000;
	const start = localAt(t, tz);
	if (start.hour >= NIGHT_FROM) t = atLocal(start.day, EVENING, tz);
	else if (start.hour < NIGHT_TO) t = atLocal(shiftDay(start.day, -1), EVENING, tz);
	return t;
}

/** A reminder's words: "Tonight: marinate the beef for tomorrow's dinner (Bulgogi)". */
export function prepTitle(what: string, recipe: string, at: number, day: string, meal: PlanMealName, tz: string) {
	const when = localAt(at, tz);
	const ahead = daysBetween(when.day, day);
	const whose =
		ahead === 0
			? 'today’s'
			: ahead === 1
				? 'tomorrow’s'
				: `${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}’s`;
	const said = what.trim().replace(/[.\s]+$/, '');
	const tonight = ahead > 0 && when.hour >= 17;
	const text = tonight ? `Tonight: ${said[0].toLowerCase()}${said.slice(1)}` : said;
	return `${text} for ${whose} ${meal} (${recipe})`.slice(0, 300);
}

/** The reminders a planned recipe brings: one for each step ahead, at its time. */
export function prepReminders(
	recipe: string,
	prep: { what: string; hoursBefore: number }[],
	day: string,
	meal: PlanMealName,
	tz: string,
) {
	return prep
		.filter((p) => p.hoursBefore > 0)
		.map((p) => {
			const at = prepAt(p.hoursBefore, day, meal, tz);
			return { title: prepTitle(p.what, recipe, at, day, meal, tz), due: new Date(at).toISOString() };
		});
}
