import { addDays, rangeLabel, timeLabel } from './dates';
import { eventsOn } from './events';
import type { CalEvent } from './types';

// Laying out the day panel's timeline: each event a block from its start to its end, events that
// overlap side by side.

const HOUR = 3_600_000;

/** In the all-day strip: all-day events, and timed ones that cover the whole day. */
export const allDayOn = (ev: CalEvent, day: Date) =>
	ev.allDay || (Date.parse(ev.start) <= day.getTime() && Date.parse(ev.end) >= addDays(day, 1).getTime());

/** A timed event's start and end on this day, in hours from midnight (cut off at the day's edges). */
function hoursOn(ev: CalEvent, day: Date) {
	const start = day.getTime();
	const end = addDays(day, 1).getTime();
	return {
		from: (Math.max(Date.parse(ev.start), start) - start) / HOUR,
		to: (Math.min(Date.parse(ev.end), end) - start) / HOUR,
	};
}

export interface Placed {
	ev: CalEvent;
	/** Where it starts and how tall it is, as fractions of the hours shown. */
	top: number;
	height: number;
	/** Its column among the events it overlaps, and how many columns they share. */
	col: number;
	cols: number;
	/** Its length in hours (short ones get a one-line block). */
	hours: number;
}

/** A day's timed events, placed in the hours `from` to `to`; overlapping ones share the width. */
export function placeDay(events: CalEvent[], day: Date, from: number, to: number): Placed[] {
	const span = to - from;
	const timed = eventsOn(events, day)
		.filter((ev) => !allDayOn(ev, day))
		.map((ev) => ({ ev, ...hoursOn(ev, day) }))
		// A block is at least a quarter hour tall, so a zero-length event still shows.
		.map((x) => ({ ...x, to: Math.max(x.to, x.from + 0.25) }))
		.sort((a, b) => a.from - b.from || b.to - a.to);
	const out: Placed[] = [];
	// Events that overlap, directly or through each other, share columns; each takes the first free one.
	let group: (Placed & { end: number })[] = [];
	let columns: number[] = [];
	const close = () => {
		for (const p of group)
			out.push({ ev: p.ev, top: p.top, height: p.height, col: p.col, cols: columns.length, hours: p.hours });
		group = [];
		columns = [];
	};
	for (const x of timed) {
		if (group.length && x.from >= Math.max(...columns)) close();
		let col = columns.findIndex((end) => end <= x.from);
		if (col === -1) col = columns.push(0) - 1;
		columns[col] = x.to;
		group.push({
			ev: x.ev,
			col,
			cols: 0,
			end: x.to,
			hours: x.to - x.from,
			top: (x.from - from) / span,
			height: (x.to - x.from) / span,
		});
	}
	close();
	return out;
}

/**
 * A timed event's time on one day: its hours, or for one over several days "from 3:00 PM" on its first,
 * "all day" in between, and "until 11:00 AM" on its last.
 */
export function timeOn(ev: CalEvent, day: Date) {
	const startsBefore = Date.parse(ev.start) < day.getTime();
	const endsAfter = Date.parse(ev.end) > addDays(day, 1).getTime();
	if (startsBefore && endsAfter) return 'all day';
	if (startsBefore) return `until ${timeLabel(ev.end)}`;
	if (endsAfter) return `from ${timeLabel(ev.start)}`;
	return rangeLabel(ev.start, ev.end);
}

/**
 * Held in the strip across the top of the week, as one bar over the days it covers: an all-day event,
 * or a timed one that lasts a day or more (camping Friday 3 PM to Sunday 11 AM). Shorter ones that cross
 * midnight stay in the hours, as a block on each day.
 */
export const inStrip = (ev: CalEvent) => ev.allDay || Date.parse(ev.end) - Date.parse(ev.start) >= 24 * HOUR;

export interface Bar {
	ev: CalEvent;
	/** The first day it covers and the one after its last, as columns of the week (0 to 7). */
	from: number;
	to: number;
	/** Its row in the strip, so bars that share a day stack. */
	row: number;
	/** It began before the week, or goes on past it (an arrow says so). */
	before: boolean;
	after: boolean;
}

/** The strip's bars for these days: each over its days, cut at the week's edges, stacked without overlapping. */
export function weekBars(events: CalEvent[], days: Date[]): Bar[] {
	const first = days[0].getTime();
	const end = addDays(days[days.length - 1], 1).getTime();
	/** Which column a moment (or an all-day date) falls in; days are midnight to midnight. */
	const col = (t: number) => days.findIndex((d, i) => t >= d.getTime() && t < addDays(days[i], 1).getTime());
	const bars = events
		.filter(inStrip)
		.map((ev) => {
			const start = ev.allDay ? new Date(`${ev.start}T00:00:00`).getTime() : Date.parse(ev.start);
			// All-day ends are exclusive dates; a timed one ends in the day its end falls in.
			const stop = ev.allDay ? new Date(`${ev.end}T00:00:00`).getTime() : Date.parse(ev.end);
			if (stop <= first || start >= end) return null;
			const from = start < first ? 0 : col(start);
			// Up to the day its last moment falls in (an end at midnight belongs to the day before).
			const to = stop > end ? days.length : col(stop - 1) + 1;
			return { ev, from, to, row: 0, before: start < first, after: stop > end };
		})
		.filter((b): b is Bar => b !== null && b.from >= 0 && b.to > b.from)
		// Earliest first, then the longest, so long bars keep the top rows.
		.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from) || a.ev.title.localeCompare(b.ev.title));
	const rows: number[][] = [];
	for (const b of bars) {
		let r = 0;
		while ((rows[r] ?? []).some((taken) => taken >= b.from && taken < b.to)) r++;
		rows[r] = [...(rows[r] ?? []), ...Array.from({ length: b.to - b.from }, (_, i) => b.from + i)];
		b.row = r;
	}
	return bars;
}
