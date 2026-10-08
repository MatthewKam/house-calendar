import type { CSSProperties } from 'react';
import { addDays, dayKey } from './dates';
import { textOn, UNASSIGNED } from './color';
import type { CalEvent, Member } from './types';

/** Events that overlap the given local day. */
export function eventsOn(events: CalEvent[], day: Date) {
  const key = dayKey(day);
  const start = day.getTime();
  const end = addDays(day, 1).getTime();
  return events.filter((ev) =>
    ev.allDay
      ? ev.start <= key && ev.end > key
      : Date.parse(ev.start) < end && Date.parse(ev.end) > start);
}

/**
 * How to color an event, split evenly between everyone it's for (gray for everyone):
 *   --stripe  the left bar, one band per person, top to bottom
 *   --tint    light background, one section per person, left to right (timed events)
 *   --tint35  a stronger tint, same split (all-day events in Month)
 *   --solid   full-color background, same split (all-day events in Week and the day panel)
 * `text` is the text color for --solid: white or black to suit the colors, or black on lighter
 * tints when the colors would need different ones.
 */
export function eventPaint(ev: CalEvent, members: Member[]) {
  const people = members.filter((m) => ev.memberIds.includes(m.id));
  const colors = people.length ? people.map((m) => m.color) : [UNASSIGNED];
  const step = 100 / colors.length;
  const split = (dir: string, paint: (c: string) => string) =>
    `linear-gradient(${dir}, ${colors.map((c, i) => `${paint(c)} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
  const tint = (pct: number) => (c: string) => `color-mix(in srgb, ${c} ${pct}%, white)`;
  const agree = new Set(colors.map(textOn)).size === 1;
  return {
    color: colors[0],
    people,
    text: agree ? textOn(colors[0]) : '#111',
    vars: {
      '--c': colors[0],
      '--stripe': split('to bottom', (c) => c),
      '--tint': split('to right', tint(14)),
      '--tint35': split('to right', tint(35)),
      '--solid': agree ? split('to right', (c) => c) : split('to right', tint(55)),
    } as CSSProperties,
  };
}

/** Over by `now`: a timed event once it has ended; an all-day one once its last day has passed. */
export const isOver = (ev: CalEvent, now: Date) =>
  ev.allDay ? ev.end <= dayKey(now) : Date.parse(ev.end) <= now.getTime();
