import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { syncOnce } from './sync.ts';
import type { CalendarSource, RemoteCalendar, RemoteEvent } from './providers/types.ts';

function fakeSource(calendars: RemoteCalendar[], events: Record<string, RemoteEvent[]>): CalendarSource {
  return {
    id: 'icloud',
    listCalendars: async () => calendars,
    fetchRange: async (id) => events[id] ?? [],
  };
}

const ev = (remoteId: string, title: string, start = '2026-10-06T16:00:00.000Z'): RemoteEvent => ({
  remoteId, etag: '"1"', title, allDay: false, start, end: '2026-10-06T17:00:00.000Z',
});

const week = { from: '2026-10-04T00:00:00.000Z', to: '2026-10-11T00:00:00.000Z', fromDay: '2026-10-04', toDay: '2026-10-11' };
const now = new Date('2026-10-06T12:00:00Z');

describe('syncOnce', () => {
  it('stores synced events, replaces them on the next pass, and keeps ids stable', async () => {
    const db = openDb(':memory:');
    const app = buildApp(db);
    const list = async () => JSON.parse((await app.inject({ url: `/api/events?${new URLSearchParams(week)}` })).body);
    await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Local', allDay: true, start: '2026-10-07', end: '2026-10-08' } });

    const home = { remoteId: 'https://x/home/', name: 'Home' };
    await syncOnce(db, fakeSource([home], { [home.remoteId]: [ev('a', 'Swim'), ev('b', 'Piano')] }), now);
    const first = await list();
    expect(first.map((e: any) => e.title).sort()).toEqual(['Local', 'Piano', 'Swim']);

    await syncOnce(db, fakeSource([{ ...home, name: 'Family' }], { [home.remoteId]: [ev('a', 'Swim lesson')] }), now);
    const second = await list();
    expect(second.map((e: any) => e.title).sort()).toEqual(['Local', 'Swim lesson']);
    const id = (evs: any[], t: string) => evs.find((e) => e.title.startsWith(t)).id;
    expect(id(second, 'Swim')).toBe(id(first, 'Swim'));
    expect(db.prepare("SELECT name FROM calendars WHERE provider = 'icloud'").all()).toEqual([{ name: 'Family' }]);

    // A calendar removed from iCloud disappears with its events; local events stay.
    await syncOnce(db, fakeSource([], {}), now);
    expect((await list()).map((e: any) => e.title)).toEqual(['Local']);
  });

  it('leaves stored events alone when a fetch fails', async () => {
    const db = openDb(':memory:');
    const home = { remoteId: 'h', name: 'Home' };
    await syncOnce(db, fakeSource([home], { h: [ev('a', 'Swim')] }), now);
    const failing: CalendarSource = { ...fakeSource([home], {}), fetchRange: async () => { throw new Error('offline'); } };
    await expect(syncOnce(db, failing, now)).rejects.toThrow('offline');
    expect(db.prepare('SELECT title FROM events').all()).toEqual([{ title: 'Swim' }]);
  });

  it('refuses to edit or delete synced events', async () => {
    const db = openDb(':memory:');
    const app = buildApp(db);
    await syncOnce(db, fakeSource([{ remoteId: 'h', name: 'Home' }], { h: [ev('a', 'Swim')] }), now);
    const { id } = db.prepare('SELECT id FROM events').get() as { id: string };
    const patch = await app.inject({ method: 'PATCH', url: `/api/events/${id}`, payload: { title: 'X' } });
    const del = await app.inject({ method: 'DELETE', url: `/api/events/${id}` });
    expect([patch.statusCode, del.statusCode]).toEqual([409, 409]);
    expect(JSON.parse(del.body).error).toMatch(/iCloud/);
  });

  it('reports no sync when no account is set up', async () => {
    const res = await buildApp(openDb(':memory:')).inject({ url: '/api/sync' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toBeNull();
  });
});

describe('duplicate events', () => {
  it('shows an event that is in two calendars once, keeping the copy that says who it is for', async () => {
    const db = openDb(':memory:');
    const app = buildApp(db);
    const riley = JSON.parse((await app.inject({ method: 'POST', url: '/api/members', payload: { name: 'Riley', color: '#2fa66a' } })).body).id;
    const halloween = (id: string, title: string): RemoteEvent => ({ remoteId: id, etag: '"1"', title, allDay: true, start: '2026-10-08', end: '2026-10-09' });
    const two: CalendarSource = {
      id: 'icloud',
      listCalendars: async () => [{ remoteId: 'a', name: 'Family' }, { remoteId: 'b', name: 'Personal' }],
      fetchRange: async (id) => (id === 'a'
        ? [halloween('a/1', 'Halloween'), ev('a/2', 'Swim')]
        : [halloween('b/1', '  halloween '), ev('b/2', 'Swim', '2026-10-07T16:00:00.000Z')]),
    };
    await syncOnce(db, two, now);
    // Assign the second calendar's Halloween to Riley; that copy should win.
    const { id } = db.prepare("SELECT id FROM events WHERE remote_id = 'b/1'").get() as { id: string };
    await app.inject({ method: 'PUT', url: `/api/events/${id}/people`, payload: { memberIds: [riley] } });

    const list = JSON.parse((await app.inject({ url: `/api/events?${new URLSearchParams(week)}` })).body);
    const h = list.filter((e: any) => e.title.trim().toLowerCase() === 'halloween');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ id, memberIds: [riley] });
    // Same title at different times is not a duplicate.
    expect(list.filter((e: any) => e.title === 'Swim')).toHaveLength(2);
  });
});
