// Today's memories (the grown-ups' Today): photos from this day a year or more ago, or, until the album
// goes back that far, from the past week or month.

import { addDays, dayKey, fromDayKey } from "./dates";
import type { Photo } from "./types";

export interface Memories {
	/** The card's heading: "On this day", "This past week" or "This past month". */
	title: string;
	/** Newest first, each with how long ago (or which day). */
	items: { photo: Photo; note: string }[];
}

/** A year back from a date, this many days early at most, for the nearest day before it with photos. */
const NEAREST_DAYS = 30;
/** How many years back to look. */
const YEARS = 10;
/** At most this many photos. */
const MOST = 12;

const day = (p: Photo) => dayKey(new Date(p.takenAt!));
const short = (key: string) => fromDayKey(key).toLocaleDateString([], { month: "short", day: "numeric" });

/**
 * The day's memories (today: YYYY-MM-DD): for each year back, its photos from this date, or from the
 * nearest day before it (up to a month early); with none, the past week's; then the past month's (since
 * the start of last month). Null when there's nothing at all.
 */
export function memoriesFor(photos: Photo[], today: string): Memories | null {
	const dated = photos.filter((p) => p.ready && p.takenAt).sort((a, b) => b.takenAt!.localeCompare(a.takenAt!));
	const now = fromDayKey(today);

	const years: Memories["items"] = [];
	for (let n = 1; n <= YEARS; n++) {
		const target = new Date(now.getFullYear() - n, now.getMonth(), now.getDate());
		const to = dayKey(target);
		const from = dayKey(addDays(target, -NEAREST_DAYS));
		// The nearest day on or before this date, a year (or more) back, with photos.
		const nearest = dated.map(day).find((d) => d <= to && d >= from);
		if (!nearest) continue;
		const ago = `${n} ${n === 1 ? "year" : "years"} ago`;
		for (const photo of dated.filter((p) => day(p) === nearest))
			years.push({ photo, note: nearest === to ? ago : `${ago} · ${short(nearest)}` });
	}
	if (years.length) return { title: "On this day", items: years.slice(0, MOST) };

	// Not a year back yet: the past week, else the past month (before today).
	const since = (from: string, title: string): Memories | null => {
		const items = dated.filter((p) => day(p) >= from && day(p) < today).map((photo) => ({ photo, note: short(day(photo)) }));
		return items.length ? { title, items: items.slice(0, MOST) } : null;
	};
	return (
		since(dayKey(addDays(now, -7)), "This past week") ??
		since(dayKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)), "This past month")
	);
}
