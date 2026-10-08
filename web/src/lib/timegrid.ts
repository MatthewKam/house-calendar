import { addDays } from './dates';
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
    for (const p of group) out.push({ ev: p.ev, top: p.top, height: p.height, col: p.col, cols: columns.length, hours: p.hours });
    group = [];
    columns = [];
  };
  for (const x of timed) {
    if (group.length && x.from >= Math.max(...columns)) close();
    let col = columns.findIndex((end) => end <= x.from);
    if (col === -1) col = columns.push(0) - 1;
    columns[col] = x.to;
    group.push({
      ev: x.ev, col, cols: 0, end: x.to, hours: x.to - x.from,
      top: (x.from - from) / span, height: (x.to - x.from) / span,
    });
  }
  close();
  return out;
}
