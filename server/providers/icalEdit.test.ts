import { describe, expect, it } from 'vitest';
import { currentDetails, deleteOccurrence, editEvent } from './icalEdit.ts';
import { expandCalendarData } from './ical.ts';

const NY = ['BEGIN:VTIMEZONE', 'TZID:America/New_York',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'DTSTART:20070311T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'DTSTART:20071104T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE'];
const cal = (...parts: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...parts, 'END:VCALENDAR'].join('\r\n');
const HREF = 'https://p1.icloud.com/cal/a.ics';

const ONE_OFF = cal(...NY, 'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Dentist', 'LOCATION:Old St', 'X-APPLE-STRUCTURED-LOCATION;VALUE=URI:geo:1,2',
  'DTSTART;TZID=America/New_York:20261006T090000', 'DTEND;TZID=America/New_York:20261006T100000', 'SEQUENCE:2', 'END:VEVENT');
const WEEKLY = cal(...NY, 'BEGIN:VEVENT', 'UID:4', 'SUMMARY:Soccer',
  'DTSTART;TZID=America/New_York:20260901T170000', 'DTEND;TZID=America/New_York:20260901T180000', 'RRULE:FREQ=WEEKLY;BYDAY=TU', 'END:VEVENT');
const OCT_13 = `${HREF}#2026-10-13T17:00:00`;

const all = (ics: string) => expandCalendarData(ics, HREF, '', new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))
  .map((e) => [e.title, e.start, e.location ?? null]);

describe('editing iCloud events', () => {
  it('reads one occurrence as it stands', () => {
    expect(currentDetails(ONE_OFF, HREF, HREF)).toEqual({
      title: 'Dentist', allDay: false, start: '2026-10-06T13:00:00.000Z', end: '2026-10-06T14:00:00.000Z', location: 'Old St' });
    expect(currentDetails(WEEKLY, HREF, OCT_13)).toMatchObject({ title: 'Soccer', start: '2026-10-13T21:00:00.000Z' });
    expect(currentDetails(WEEKLY, HREF, `${HREF}#2026-10-14T17:00:00`)).toBeNull();
  });

  it('changes a one-off event, dropping the old map pin and counting the change', () => {
    const out = editEvent(ONE_OFF, HREF, HREF, { title: 'Dentist (moved)', allDay: false,
      start: '2026-10-07T15:00:00.000Z', end: '2026-10-07T16:00:00.000Z', location: '1 New Rd' });
    expect(currentDetails(out, HREF, HREF)).toEqual({ title: 'Dentist (moved)', allDay: false,
      start: '2026-10-07T15:00:00.000Z', end: '2026-10-07T16:00:00.000Z', location: '1 New Rd' });
    expect(out).not.toContain('X-APPLE-STRUCTURED-LOCATION');
    expect(out).toContain('SEQUENCE:3');
    expect(out).toContain('UID:1');
  });

  it('can make an event all day and clear its address', () => {
    const out = editEvent(ONE_OFF, HREF, HREF, { allDay: true, start: '2026-10-06', end: '2026-10-07', location: null });
    expect(currentDetails(out, HREF, HREF)).toMatchObject({ allDay: true, start: '2026-10-06', end: '2026-10-07', location: null });
  });

  it('changes one day of a repeating event and leaves the others', () => {
    const out = editEvent(WEEKLY, HREF, OCT_13, { title: 'Soccer (field 2)', allDay: false,
      start: '2026-10-14T21:00:00.000Z', end: '2026-10-14T22:00:00.000Z' });
    expect(all(out)).toEqual([
      ['Soccer', '2026-10-06T21:00:00.000Z', null],
      ['Soccer (field 2)', '2026-10-14T21:00:00.000Z', null],
      ['Soccer', '2026-10-20T21:00:00.000Z', null],
      ['Soccer', '2026-10-27T21:00:00.000Z', null],
    ]);
    expect(out).toContain('RECURRENCE-ID;TZID=America/New_York:20261013T170000');
    // Editing the same day again changes that copy rather than adding another.
    const again = editEvent(out, HREF, OCT_13, { title: 'Soccer (field 3)' });
    expect(again.match(/RECURRENCE-ID/g)).toHaveLength(1);
    expect(currentDetails(again, HREF, OCT_13)).toMatchObject({ title: 'Soccer (field 3)', start: '2026-10-14T21:00:00.000Z' });
  });

  it('deletes one day of a repeating event, or the whole of a one-off', () => {
    const out = deleteOccurrence(WEEKLY, HREF, OCT_13)!;
    expect(all(out).map((e) => e[1])).toEqual(['2026-10-06T21:00:00.000Z', '2026-10-20T21:00:00.000Z', '2026-10-27T21:00:00.000Z']);
    expect(out).toContain('EXDATE;TZID=America/New_York:20261013T170000');
    expect(deleteOccurrence(ONE_OFF, HREF, HREF)).toBeNull();
    // A day that had been edited loses its copy too.
    const edited = editEvent(WEEKLY, HREF, OCT_13, { title: 'Moved' });
    expect(all(deleteOccurrence(edited, HREF, OCT_13)!).map((e) => e[0])).toEqual(['Soccer', 'Soccer', 'Soccer']);
  });

  it('changes every day of a repeating event, keeping moved and skipped days in line', async () => {
    const { editSeries, seriesDetails } = await import('./icalEdit.ts');
    // Oct 13 moved to the 14th, Oct 20 skipped.
    const withExceptions = deleteOccurrence(editEvent(WEEKLY, HREF, OCT_13, { allDay: false,
      start: '2026-10-14T21:00:00.000Z', end: '2026-10-14T22:00:00.000Z' }), HREF, `${HREF}#2026-10-20T17:00:00`)!;
    const out = editSeries(withExceptions, { title: 'Soccer practice', location: 'Field 3', shiftMs: 3_600_000, durationMs: 5_400_000 });
    expect(seriesDetails(out)).toEqual({ title: 'Soccer practice', location: 'Field 3' });
    // An hour later, 90 minutes long; the moved day moves too, the skipped day stays skipped.
    expect(all(out)).toEqual([
      ['Soccer practice', '2026-10-06T22:00:00.000Z', 'Field 3'],
      ['Soccer practice', '2026-10-14T22:00:00.000Z', 'Field 3'],
      ['Soccer practice', '2026-10-27T22:00:00.000Z', 'Field 3'],
    ]);
    const first = expandCalendarData(out, HREF, '', new Date('2026-10-01T00:00:00Z'), new Date('2026-10-08T00:00:00Z'))[0];
    expect(Date.parse(first.end) - Date.parse(first.start)).toBe(5_400_000);
  });
});
