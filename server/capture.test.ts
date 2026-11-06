import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import type { CaptureContext, CaptureInput, Found } from './capture.ts';

const item = (f: Partial<Found[number]>): Found[number] =>
  ({ kind: 'item', title: '', list: null, date: null, time: null, endDate: null, endTime: null, people: [], location: null, notes: null, ...f });

function setup(found: Found | Error | null) {
  const db = openDb(':memory:');
  const born = `${new Date().getFullYear() - 4}-01-01`;
  db.prepare(`INSERT INTO members (id, name, color, sort_order) VALUES ('alex', 'Alex Kim', '#000000', 0)`).run();
  db.prepare(`INSERT INTO members (id, name, color, birthdate, sort_order) VALUES ('sam', 'Sam', '#111111', ?, 1)`).run(born);
  db.prepare(`INSERT INTO lists (id, title) VALUES ('g', 'Groceries')`).run();
  const asked: { input: CaptureInput; ctx: CaptureContext }[] = [];
  const app = buildApp(db, found === null ? {} : {
    understand: async (input, ctx) => {
      asked.push({ input, ctx });
      if (found instanceof Error) throw found;
      return found;
    },
  });
  const call = async (method: string, url: string, payload?: object) => {
    const res = await app.inject({ method: method as 'GET', url, payload });
    return { status: res.statusCode, body: res.body ? res.json() : undefined };
  };
  return { call, asked };
}

const tz = 'America/Los_Angeles';

describe('capture', () => {
  it('is off without Claude', async () => {
    const { call } = setup(null);
    expect((await call('GET', '/api/capture')).body).toEqual({ on: false });
    expect((await call('POST', '/api/capture', { text: 'Milk', timeZone: tz })).status).toBe(503);
  });

  it('turns what Claude found into cards: lists, times, people and kids checked', async () => {
    const { call, asked } = setup([
      item({ title: 'Call the dentist', date: '2026-11-13', time: '10:00', people: ['Alex'] }),
      item({ title: 'Milk', list: 'groceries' }),
      item({ title: 'Sunscreen', list: 'Costco' }),
      item({ title: 'Library books', date: '2026-11-14' }),
      item({ kind: 'event', title: 'Swim', date: '2026-11-14', time: '9:00', people: ['sam'], location: 'The Y', notes: ' Bring a towel ' }),
      item({ kind: 'event', title: 'Book fair', date: '2026-11-16', endDate: '2026-11-18' }),
      item({ kind: 'event', title: 'No date' }),
      item({ kind: 'task', title: 'Return library book', date: '2026-11-14', people: ['Sam'] }),
      item({ kind: 'task', title: 'Not a kid', date: '2026-11-14', people: ['Alex'] }),
      item({ title: '   ' }),
    ]);
    expect((await call('GET', '/api/capture')).body).toEqual({ on: true });
    const res = await call('POST', '/api/capture', { text: ' Remind me… ', timeZone: tz });
    expect(res.status).toBe(200);
    expect(res.body.proposals).toEqual([
      { kind: 'item', title: 'Call the dentist', list: 'To do', due: '2026-11-13T18:00:00.000Z', memberId: 'alex' },
      { kind: 'item', title: 'Milk', list: 'Groceries', due: null, memberId: null },
      { kind: 'item', title: 'Sunscreen', list: 'Costco', due: null, memberId: null },
      { kind: 'item', title: 'Library books', list: 'To do', due: '2026-11-14', memberId: null },
      { kind: 'event', title: 'Swim', allDay: false, start: '2026-11-14T17:00:00.000Z', end: '2026-11-14T18:00:00.000Z', memberIds: ['sam'], location: 'The Y', notes: 'Bring a towel' },
      { kind: 'event', title: 'Book fair', allDay: true, start: '2026-11-16', end: '2026-11-19', memberIds: [], location: null, notes: null },
      { kind: 'task', title: 'Return library book', memberId: 'sam', day: '2026-11-14' },
    ]);
    // What Claude was given: the words, the day, the family and the lists; nothing from the calendar.
    expect(asked[0].input).toEqual({ text: 'Remind me…' });
    expect(asked[0].ctx).toMatchObject({ timeZone: tz, speaker: null, lists: ['Groceries'],
      family: [{ name: 'Alex Kim', kid: false }, { name: 'Sam', kid: true }] });
    expect(asked[0].ctx.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reads a photo, and says so kindly when it fails', async () => {
    const { call, asked } = setup([]);
    const image = { mediaType: 'image/jpeg', data: 'aGk=' };
    expect((await call('POST', '/api/capture', { image, timeZone: tz })).body).toEqual({ proposals: [] });
    expect(asked[0].input).toEqual({ image });
    expect((await call('POST', '/api/capture', { timeZone: tz })).status).toBe(400);
    expect((await call('POST', '/api/capture', { text: 'Milk', timeZone: 'Mars/Base' })).status).toBe(400);

    const failing = setup(new Error('overloaded'));
    expect((await failing.call('POST', '/api/capture', { text: 'Milk', timeZone: tz })).status).toBe(502);
    const badKey = setup(Object.assign(new Error('invalid x-api-key'), { status: 401 }));
    expect((await badKey.call('POST', '/api/capture', { text: 'Milk', timeZone: tz })).body.error).toMatch(/key isn't working/);
  });
});
