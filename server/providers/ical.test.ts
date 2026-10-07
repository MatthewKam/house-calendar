import { describe, expect, it } from 'vitest';
import { expandCalendarData } from './ical.ts';

const NY = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

const cal = (...parts: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...parts, 'END:VCALENDAR'].join('\r\n');

const from = new Date('2026-10-01T00:00:00Z');
const to = new Date('2026-11-01T00:00:00Z');
const expand = (ics: string) => expandCalendarData(ics, 'https://p1.icloud.com/cal/a.ics', '"e1"', from, to);

describe('expandCalendarData', () => {
  it('converts a timed event in its own time zone to UTC', () => {
    const [ev] = expand(cal(NY, 'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Dentist',
      'DTSTART;TZID=America/New_York:20261006T090000', 'DTEND;TZID=America/New_York:20261006T100000', 'END:VEVENT'));
    expect(ev).toEqual({
      remoteId: 'https://p1.icloud.com/cal/a.ics', etag: '"e1"', title: 'Dentist',
      allDay: false, start: '2026-10-06T13:00:00.000Z', end: '2026-10-06T14:00:00.000Z', location: null,
    });
  });

  it('keeps all-day events as dates with an exclusive end', () => {
    const [ev] = expand(cal('BEGIN:VEVENT', 'UID:2', 'SUMMARY:Camp',
      'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261015', 'END:VEVENT'));
    expect(ev).toMatchObject({ allDay: true, start: '2026-10-12', end: '2026-10-15' });
  });

  it('treats an all-day event without an end as one day', () => {
    const [ev] = expand(cal('BEGIN:VEVENT', 'UID:3', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261031', 'END:VEVENT'));
    expect(ev).toMatchObject({ start: '2026-10-31', end: '2026-11-01' });
  });

  it('expands a weekly repeat, applying a moved occurrence and a skipped one', () => {
    const events = expand(cal(NY,
      'BEGIN:VEVENT', 'UID:4', 'SUMMARY:Soccer',
      'DTSTART;TZID=America/New_York:20260901T170000', 'DTEND;TZID=America/New_York:20260901T180000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE;TZID=America/New_York:20261020T170000', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:4', 'SUMMARY:Soccer (moved)', 'RECURRENCE-ID;TZID=America/New_York:20261013T170000',
      'DTSTART;TZID=America/New_York:20261014T170000', 'DTEND;TZID=America/New_York:20261014T180000', 'END:VEVENT'));
    expect(events.map((e) => [e.title, e.start])).toEqual([
      ['Soccer', '2026-10-06T21:00:00.000Z'],
      ['Soccer (moved)', '2026-10-14T21:00:00.000Z'],
      ['Soccer', '2026-10-27T21:00:00.000Z'],
    ]);
    // Each occurrence gets its own stable id.
    expect(new Set(events.map((e) => e.remoteId)).size).toBe(3);
    expect(events[0].remoteId).toBe('https://p1.icloud.com/cal/a.ics#2026-10-06T17:00:00');
  });

  it('keeps the location on one line', () => {
    const [ev] = expand(cal('BEGIN:VEVENT', 'UID:7', 'SUMMARY:Dentist', 'LOCATION:Sky Pediatric Dentistry\\n123 Main St\\, Irvine',
      'DTSTART:20261006T160000Z', 'DTEND:20261006T170000Z', 'END:VEVENT'));
    expect(ev.location).toBe('Sky Pediatric Dentistry, 123 Main St, Irvine');
  });

  it('skips cancelled events', () => {
    expect(expand(cal('BEGIN:VEVENT', 'UID:5', 'SUMMARY:Off', 'STATUS:CANCELLED',
      'DTSTART:20261006T090000Z', 'DTEND:20261006T100000Z', 'END:VEVENT'))).toEqual([]);
  });

  it('drops events outside the window', () => {
    expect(expand(cal('BEGIN:VEVENT', 'UID:6', 'SUMMARY:Later',
      'DTSTART:20261206T090000Z', 'DTEND:20261206T100000Z', 'END:VEVENT'))).toEqual([]);
  });
});
