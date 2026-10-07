import ICAL from 'ical.js';
import { expandCalendarData } from './ical.ts';

// Changes to one CalDAV resource (a VCALENDAR) for edits made on the wall. A repeating event is
// changed one day at a time: that day gets its own copy of the event (an override with a
// RECURRENCE-ID), or an EXDATE to delete it, and the rest of the series is left alone.

/** The details the wall can change. Times as stored: ISO instants, or YYYY-MM-DD (end exclusive). */
export interface Details {
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  location: string | null;
}

const DAY_MS = 86_400_000;

function load(ics: string) {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);
  const vevents = root.getAllSubcomponents('vevent');
  return { root, vevents, master: vevents.find((v) => !v.hasProperty('recurrence-id')) };
}

/** The "#..." part of an occurrence's id, or null for a one-off event. */
const recurrenceOf = (href: string, remoteId: string) => (remoteId.length > href.length ? remoteId.slice(href.length + 1) : null);

const sameRecurrence = (v: ICAL.Component, rid: string) => String(v.getFirstPropertyValue('recurrence-id')) === rid;

/** How one occurrence looks in this resource right now; null when it's gone (deleted or cancelled). */
export function currentDetails(ics: string, href: string, remoteId: string): Details | null {
  const rid = recurrenceOf(href, remoteId);
  // A moved occurrence keeps its id; look a year either side of where it was first scheduled.
  const around = rid ? Date.parse(rid.length === 10 ? `${rid}T00:00:00Z` : rid) : NaN;
  const from = new Date(Number.isNaN(around) ? 0 : around - 366 * DAY_MS);
  const to = new Date(Number.isNaN(around) ? Date.UTC(2200, 0) : around + 366 * DAY_MS);
  const found = expandCalendarData(ics, href, '', from, to).find((e) => e.remoteId === remoteId);
  return found ? { title: found.title, allDay: found.allDay, start: found.start, end: found.end, location: found.location ?? null } : null;
}

/** A DATE or DATE-TIME property, copying a time zone parameter when the time has none of its own. */
function timeProp(name: string, time: ICAL.Time, tzid?: string | null) {
  const p = new ICAL.Property(name);
  p.setValue(time);
  if (tzid && !time.isDate && time.zone !== ICAL.Timezone.utcTimezone) p.setParameter('tzid', tzid);
  return p;
}

function stamp(v: ICAL.Component) {
  const now = ICAL.Time.fromJSDate(new Date(), true);
  v.updatePropertyWithValue('dtstamp', now);
  v.updatePropertyWithValue('last-modified', now);
  v.updatePropertyWithValue('sequence', Number(v.getFirstPropertyValue('sequence') ?? 0) + 1);
}

/** The component for one day of a repeating event, made from the series if it has no copy yet. */
function overrideFor(root: ICAL.Component, master: ICAL.Component, vevents: ICAL.Component[], rid: string) {
  const existing = vevents.find((v) => sameRecurrence(v, rid));
  if (existing) return existing;
  const copy = new ICAL.Component(JSON.parse(JSON.stringify(master.toJSON())));
  for (const name of ['rrule', 'rdate', 'exdate', 'exrule']) copy.removeAllProperties(name);
  const startProp = master.getFirstProperty('dtstart')!;
  const tzid = startProp.getParameter('tzid') as string | undefined;
  const start = ICAL.Time.fromString(rid, undefined as never);
  // Same length as the series.
  const event = new ICAL.Event(master);
  const end = start.clone();
  end.addDuration(event.duration);
  copy.removeAllProperties('dtstart');
  copy.removeAllProperties('dtend');
  copy.removeAllProperties('duration');
  copy.addProperty(timeProp('recurrence-id', start, tzid));
  copy.addProperty(timeProp('dtstart', start, tzid));
  copy.addProperty(timeProp('dtend', end, tzid));
  root.addSubcomponent(copy);
  return copy;
}

/** Returns the resource with the occurrence's details changed. */
export function editEvent(ics: string, href: string, remoteId: string, changes: Partial<Details>): string {
  const { root, vevents, master } = load(ics);
  const rid = recurrenceOf(href, remoteId);
  const target = !rid ? (master ?? vevents[0]) : master ? overrideFor(root, master, vevents, rid) : vevents.find((v) => sameRecurrence(v, rid));
  if (!target) throw new Error('Event not found in its iCloud resource');

  if (changes.title !== undefined) target.updatePropertyWithValue('summary', changes.title);
  if (changes.start !== undefined && changes.end !== undefined) {
    const allDay = changes.allDay ?? Boolean(target.getFirstPropertyValue('dtstart') && (target.getFirstPropertyValue('dtstart') as ICAL.Time).isDate);
    const time = (v: string) => (allDay ? ICAL.Time.fromDateString(v) : ICAL.Time.fromJSDate(new Date(v), true));
    for (const name of ['dtstart', 'dtend', 'duration']) target.removeAllProperties(name);
    target.addProperty(timeProp('dtstart', time(changes.start)));
    target.addProperty(timeProp('dtend', time(changes.end)));
  }
  if (changes.location !== undefined) {
    // Apple's map pin goes with the old address.
    target.removeAllProperties('x-apple-structured-location');
    if (changes.location) target.updatePropertyWithValue('location', changes.location);
    else target.removeAllProperties('location');
  }
  stamp(target);
  return root.toString();
}

/** A new event resource, for one made on the wall. */
export function newEvent(uid: string, d: Details): string {
  const root = new ICAL.Component(['vcalendar', [], []]);
  root.updatePropertyWithValue('version', '2.0');
  root.updatePropertyWithValue('prodid', '-//Household//Wall Calendar//EN');
  const ev = new ICAL.Component('vevent');
  ev.updatePropertyWithValue('uid', uid);
  ev.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
  ev.updatePropertyWithValue('summary', d.title);
  const time = (v: string) => (d.allDay ? ICAL.Time.fromDateString(v) : ICAL.Time.fromJSDate(new Date(v), true));
  ev.addProperty(timeProp('dtstart', time(d.start)));
  ev.addProperty(timeProp('dtend', time(d.end)));
  if (d.location) ev.updatePropertyWithValue('location', d.location);
  root.addSubcomponent(ev);
  return root.toString();
}

/**
 * Returns the resource without the occurrence: the series skips that day (EXDATE). Null means the
 * whole resource should be deleted (a one-off event, or nothing left).
 */
export function deleteOccurrence(ics: string, href: string, remoteId: string): string | null {
  const { root, vevents, master } = load(ics);
  const rid = recurrenceOf(href, remoteId);
  if (!rid) return null;
  for (const v of vevents.filter((x) => sameRecurrence(x, rid))) root.removeSubcomponent(v);
  if (!master) return root.getAllSubcomponents('vevent').length ? root.toString() : null;
  const tzid = master.getFirstProperty('dtstart')!.getParameter('tzid') as string | undefined;
  master.addProperty(timeProp('exdate', ICAL.Time.fromString(rid, undefined as never), tzid));
  stamp(master);
  return root.toString();
}
