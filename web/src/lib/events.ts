import type { CSSProperties } from 'react';
import { addDays, dayKey } from './dates';
import { UNASSIGNED } from './color';
import type { CalEvent, Member } from './types';

/** Events that overlap the given local day. */
export function eventsOn(events: CalEvent[], day: Date) {
	const key = dayKey(day);
	const start = day.getTime();
	const end = addDays(day, 1).getTime();
	return events.filter((ev) =>
		ev.allDay ? ev.start <= key && ev.end > key : Date.parse(ev.start) < end && Date.parse(ev.end) > start,
	);
}

/**
 * How to color an event, split evenly between everyone it's for (gray for everyone):
 *   --stripe  the left bar, one band per person, top to bottom
 *   --tint    light background, one section per person, left to right (timed events, and all-day ones
 *             in Week and the day panel)
 *   --tint35  a stronger tint, same split (all-day events in Month)
 */
export function eventPaint(ev: CalEvent, members: Member[]) {
	const people = members.filter((m) => ev.memberIds.includes(m.id));
	const colors = people.length ? people.map((m) => m.color) : [UNASSIGNED];
	const step = 100 / colors.length;
	const split = (dir: string, paint: (c: string) => string) =>
		`linear-gradient(${dir}, ${colors.map((c, i) => `${paint(c)} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
	// Light tints over the page's surface (dark ones in dark mode, under light text).
	const tint = (pct: number) => (c: string) => `color-mix(in srgb, ${c} ${pct}%, var(--surface))`;
	return {
		color: colors[0],
		people,
		vars: {
			'--c': colors[0],
			'--stripe': split('to bottom', (c) => c),
			'--tint': split('to right', tint(14)),
			'--tint35': split('to right', tint(35)),
			// Full strength, side by side: a thin bar for the event (the condensed month).
			'--bar': split('to right', (c) => c),
		} as CSSProperties,
	};
}

/** Over by `now`: a timed event once it has ended; an all-day one once its last day has passed. */
export const isOver = (ev: CalEvent, now: Date) =>
	ev.allDay ? ev.end <= dayKey(now) : Date.parse(ev.end) <= now.getTime();
