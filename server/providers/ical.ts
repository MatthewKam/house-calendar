import ICAL from 'ical.js';
import type { RemoteEvent } from './types.ts';

// Stop walking a recurrence rule after this many occurrences, so a daily event that started
// decades ago (or a malformed rule) can't stall a sync.
const MAX_OCCURRENCES = 20_000;

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

function times(start: ICAL.Time, end: ICAL.Time): Pick<RemoteEvent, 'allDay' | 'start' | 'end'> {
  if (start.isDate) {
    // All-day end is exclusive; a missing or zero-length end means a one-day event.
    let last = end;
    if (end.compare(start) <= 0) {
      last = start.clone();
      last.adjust(1, 0, 0, 0);
    }
    return { allDay: true, start: dayOf(start), end: dayOf(last) };
  }
  const s = start.toJSDate();
  const e = end.toJSDate();
  return { allDay: false, start: s.toISOString(), end: (e > s ? e : s).toISOString() };
}

/** An event's LOCATION on one line (Apple puts the place name and street on separate lines). */
const locationOf = (c: ICAL.Component) =>
  String(c.getFirstPropertyValue('location') ?? '').replace(/\s*\n\s*/g, ', ').trim() || null;

const cancelled = (c: ICAL.Component) => String(c.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';

/**
 * Turns one CalDAV resource (a VCALENDAR holding an event and any edited occurrences of it)
 * into the occurrences that overlap [from, to).
 */
export function expandCalendarData(ics: string, href: string, etag: string, from: Date, to: Date): RemoteEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  // Resources carry their own time zone definitions; register them so TZID times convert correctly.
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);

  const vevents = root.getAllSubcomponents('vevent');
  const master = vevents.find((v) => !v.hasProperty('recurrence-id'));
  const out: RemoteEvent[] = [];
  const add = (remoteId: string, title: string, start: ICAL.Time, end: ICAL.Time, location: string | null) => {
    const t = times(start, end);
    const startMs = t.allDay ? start.toJSDate().getTime() : Date.parse(t.start);
    const endMs = t.allDay ? ICAL.Time.fromDateString(t.end).toJSDate().getTime() : Date.parse(t.end);
    // Zero-length timed events still show if they start inside the window.
    if (startMs < to.getTime() && (endMs > from.getTime() || (endMs === startMs && startMs >= from.getTime()))) {
      out.push({ remoteId, etag, title: title || '(No title)', ...t, location });
    }
  };

  if (!master) {
    // Only edited occurrences were shared with us; show each one as it stands.
    for (const v of vevents) {
      if (cancelled(v)) continue;
      const ev = new ICAL.Event(v);
      add(`${href}#${ev.recurrenceId.toString()}`, ev.summary, ev.startDate, ev.endDate, locationOf(v));
    }
    return out;
  }

  const event = new ICAL.Event(master, { exceptions: vevents.filter((v) => v !== master) });
  if (!event.isRecurring()) {
    if (!cancelled(master)) add(href, event.summary, event.startDate, event.endDate, locationOf(master));
    return out;
  }

  const it = event.iterator();
  for (let n = 0, next = it.next(); next && n < MAX_OCCURRENCES; n++, next = it.next()) {
    const occ = event.getOccurrenceDetails(next);
    if (occ.startDate.toJSDate() >= to) break;
    if (cancelled(occ.item.component)) continue;
    add(`${href}#${occ.recurrenceId.toString()}`, occ.item.summary, occ.startDate, occ.endDate, locationOf(occ.item.component));
  }
  return out;
}
