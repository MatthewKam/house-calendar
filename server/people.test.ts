import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { syncOnce } from './sync.ts';
import { assignPending, pendingSeries, type Classify } from './people.ts';
import type { CalendarSource, RemoteEvent } from './providers/types.ts';

const now = new Date('2026-10-06T12:00:00Z');
const ev = (remoteId: string, title: string, day = 6): RemoteEvent => ({
  remoteId, etag: '"1"', title, allDay: false,
  start: `2026-10-${String(day).padStart(2, '0')}T16:00:00.000Z`, end: `2026-10-${String(day).padStart(2, '0')}T17:00:00.000Z`,
});
const source = (events: RemoteEvent[]): CalendarSource => ({
  id: 'icloud',
  listCalendars: async () => [{ remoteId: 'cal', name: 'Family' }],
  fetchRange: async () => events,
});

/** Picks every member whose name appears in the title, like Claude would for these simple cases. */
function nameMatcher(calls: number[] = []): Classify {
  return async (members, items) => {
    calls.push(items.length);
    return items.map((it) => members.filter((m) => it.title.includes(m.name)).map((m) => m.id));
  };
}

async function setup() {
  const db = openDb(':memory:');
  const app = buildApp(db);
  const add = async (name: string) =>
    JSON.parse((await app.inject({ method: 'POST', url: '/api/members', payload: { name, color: '#2f7de1' } })).body).id as string;
  /** Who the events with this title are for (every copy must agree). */
  const memberOf = (title: string) => {
    const ids = (db.prepare('SELECT id FROM events WHERE title = ?').all(title) as { id: string }[]).map((e) => e.id);
    const people = ids.map((id) => (db.prepare('SELECT member_id FROM event_members WHERE event_id = ? ORDER BY member_id')
      .all(id) as { member_id: string }[]).map((r) => r.member_id));
    expect(new Set(people.map((p) => p.join()))).toHaveLength(1);
    return people[0];
  };
  return { db, app, add, memberOf };
}

const swim = [ev('cal/swim.ics#2026-10-06T16:00:00', 'Sam - swim class', 6), ev('cal/swim.ics#2026-10-13T16:00:00', 'Sam - swim class', 13)];

describe('assigning people to synced events', () => {
  it('asks once per series and applies the pick to every repeat', async () => {
    const { db, add, memberOf } = await setup();
    const sam = await add('Sam');
    await syncOnce(db, source([...swim, ev('cal/bill.ics', 'AT&T bill')]), now);

    const calls: number[] = [];
    expect(await assignPending(db, nameMatcher(calls))).toBe(1);
    expect(calls).toEqual([2]); // two series, not three events
    expect(memberOf('Sam - swim class')).toEqual([sam]);
    expect(memberOf('AT&T bill')).toEqual([]);

    // Nothing new to ask about, including the bill Claude left as "everyone".
    expect(pendingSeries(db)).toEqual([]);
  });

  it('keeps assignments when the next sync replaces the events', async () => {
    const { db, add, memberOf } = await setup();
    const sam = await add('Sam');
    await syncOnce(db, source(swim), now);
    await assignPending(db, nameMatcher());
    await syncOnce(db, source(swim), now);
    expect(memberOf('Sam - swim class')).toEqual([sam]);
  });

  it('lets a manual pick override Claude, and Claude never changes it back', async () => {
    const { db, app, add, memberOf } = await setup();
    await add('Sam');
    const riley = await add('Riley');
    await syncOnce(db, source(swim), now);
    await assignPending(db, nameMatcher());

    const { id } = db.prepare('SELECT id FROM events LIMIT 1').get() as { id: string };
    const res = await app.inject({ method: 'PUT', url: `/api/events/${id}/people`, payload: { memberIds: [riley] } });
    expect(res.statusCode).toBe(200);
    expect(memberOf('Sam - swim class')).toEqual([riley]);

    await add('Jordan'); // family changed, so AI picks are redone, but not manual ones
    expect(pendingSeries(db)).toEqual([]);
    await syncOnce(db, source(swim), now);
    expect(memberOf('Sam - swim class')).toEqual([riley]);
  });

  it('asks again about AI picks when the family changes', async () => {
    const { db, add, memberOf } = await setup();
    await add('Sam');
    await syncOnce(db, source([ev('cal/x.ics', 'Riley - soccer')]), now);
    await assignPending(db, nameMatcher());
    expect(memberOf('Riley - soccer')).toEqual([]);

    const riley = await add('Riley');
    expect(pendingSeries(db)).toHaveLength(1);
    await assignPending(db, nameMatcher());
    expect(memberOf('Riley - soccer')).toEqual([riley]);
  });

  it('ignores ids the classifier made up', async () => {
    const { db, add, memberOf } = await setup();
    await add('Sam');
    await syncOnce(db, source(swim), now);
    await assignPending(db, async (_m, items) => items.map(() => ['not-a-member']));
    expect(memberOf('Sam - swim class')).toEqual([]);
  });

  it('rejects unknown people and local events', async () => {
    const { db, app } = await setup();
    await syncOnce(db, source(swim), now);
    const { id } = db.prepare('SELECT id FROM events LIMIT 1').get() as { id: string };
    expect((await app.inject({ method: 'PUT', url: `/api/events/${id}/people`, payload: { memberIds: ['nope'] } })).statusCode).toBe(400);
    const local = JSON.parse((await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Local', allDay: true, start: '2026-10-07', end: '2026-10-08' } })).body);
    expect((await app.inject({ method: 'PUT', url: `/api/events/${local.id}/people`, payload: { memberIds: [] } })).statusCode).toBe(404);
  });
});

describe('calendars linked to a person', () => {
  it('beats Claude, loses to manual picks, and stops Claude being asked', async () => {
    const { db, app, add, memberOf } = await setup();
    const sam = await add('Sam');
    const alex = await add('Alex');
    await syncOnce(db, source([...swim, ev('cal/derm.ics', 'Derm Appt')]), now);
    await assignPending(db, nameMatcher());
    const cal = (db.prepare("SELECT id FROM calendars WHERE provider = 'icloud'").get() as { id: string }).id;

    const { id: dermId } = db.prepare("SELECT id FROM events WHERE title = 'Derm Appt'").get() as { id: string };
    await app.inject({ method: 'PUT', url: `/api/events/${dermId}/people`, payload: { memberIds: [sam] } });

    const res = await app.inject({ method: 'PATCH', url: `/api/calendars/${cal}`, payload: { memberId: alex } });
    expect(res.statusCode).toBe(200);
    expect(memberOf('Sam - swim class')).toEqual([alex]); // the calendar link beats Claude's pick
    expect(memberOf('Derm Appt')).toEqual([sam]); // the manual pick beats the calendar link
    expect(pendingSeries(db)).toEqual([]);

    // Survives a resync, and unlinking brings Claude's pick back.
    await syncOnce(db, source([...swim, ev('cal/derm.ics', 'Derm Appt')]), now);
    expect(memberOf('Sam - swim class')).toEqual([alex]);
    await app.inject({ method: 'PATCH', url: `/api/calendars/${cal}`, payload: { memberId: null } });
    expect(memberOf('Sam - swim class')).toEqual([sam]);

    // Removing the linked person falls back the same way.
    await app.inject({ method: 'PATCH', url: `/api/calendars/${cal}`, payload: { memberId: alex } });
    await app.inject({ method: 'DELETE', url: `/api/members/${alex}` });
    expect(memberOf('Sam - swim class')).toEqual([sam]);
  });

  it('hides a calendar from the wall and from Claude', async () => {
    const { db, app, add } = await setup();
    await add('Sam');
    await syncOnce(db, source(swim), now);
    const cal = (db.prepare("SELECT id FROM calendars WHERE provider = 'icloud'").get() as { id: string }).id;
    await app.inject({ method: 'PATCH', url: `/api/calendars/${cal}`, payload: { hidden: true } });

    const week = new URLSearchParams({ from: '2026-10-04T00:00:00.000Z', to: '2026-10-11T00:00:00.000Z', fromDay: '2026-10-04', toDay: '2026-10-11' });
    expect(JSON.parse((await app.inject({ url: `/api/events?${week}` })).body)).toEqual([]);
    expect(pendingSeries(db)).toEqual([]);

    const [listed] = JSON.parse((await app.inject({ url: '/api/calendars' })).body);
    expect(listed).toMatchObject({ id: cal, name: 'Family', hidden: true, memberId: null, events: 1 });
  });
});

describe('events for several people', () => {
  it('lets Claude and manual picks name several people, and survives one of them leaving', async () => {
    const { db, app, add, memberOf } = await setup();
    const riley = await add('Riley');
    const sam = await add('Sam');
    await syncOnce(db, source([ev('cal/swim.ics', 'Riley & Sam swim'), ev('cal/bed.ics', 'Make beds')]), now);
    await assignPending(db, nameMatcher());
    expect(memberOf('Riley & Sam swim').sort()).toEqual([riley, sam].sort());

    const { id } = db.prepare("SELECT id FROM events WHERE title = 'Make beds'").get() as { id: string };
    const res = await app.inject({ method: 'PUT', url: `/api/events/${id}/people`, payload: { memberIds: [sam, riley] } });
    expect(JSON.parse(res.body).memberIds).toEqual([riley, sam]); // family order

    // Removing Sam keeps Riley on both.
    await app.inject({ method: 'DELETE', url: `/api/members/${sam}` });
    expect(memberOf('Riley & Sam swim')).toEqual([riley]);
    expect(memberOf('Make beds')).toEqual([riley]);
  });
});
