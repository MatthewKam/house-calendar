import { describe, expect, it } from 'vitest';
import { openDb, type DB } from './db.ts';
import { buildApp } from './app.ts';
import { syncOnce } from './sync.ts';
import { pushOutbox, SEND_AFTER_MS } from './outbox.ts';
import { expandCalendarData } from './providers/ical.ts';
import { currentDetails } from './providers/icalEdit.ts';
import type { CalendarSource, CalendarWriter } from './providers/types.ts';

const CAL = 'https://p1.icloud.com/home/';
const DENTIST = `${CAL}dentist.ics`;
const SOCCER = `${CAL}soccer.ics`;
const ics = (...lines: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...lines, 'END:VCALENDAR'].join('\r\n');

/** A pretend iCloud calendar: resources with etags, read and written the way CalDAV does. */
function fakeICloud() {
  let version = 0;
  const store = new Map<string, { data: string; etag: string }>();
  const put = (href: string, data: string) => store.set(href, { data, etag: `"${++version}"` });
  put(DENTIST, ics('BEGIN:VEVENT', 'UID:d', 'SUMMARY:Dentist', 'DTSTART:20261006T160000Z', 'DTEND:20261006T170000Z', 'END:VEVENT'));
  put(SOCCER, ics('BEGIN:VEVENT', 'UID:s', 'SUMMARY:Soccer', 'DTSTART:20261006T230000Z', 'DTEND:20261007T000000Z',
    'RRULE:FREQ=WEEKLY;COUNT=4', 'END:VEVENT'));
  const net = { down: false, raceOnce: false };
  const source: CalendarSource & CalendarWriter = {
    id: 'icloud',
    listCalendars: async () => [{ remoteId: CAL, name: 'Home' }],
    fetchRange: async (_cal, from, to) => [...store].flatMap(([href, r]) => expandCalendarData(r.data, href, r.etag, from, to)),
    getEvent: async (href) => {
      if (net.down) throw new Error('fetch failed');
      return store.get(href) ?? null;
    },
    writeEvent: async (href, etag, data) => {
      if (net.down) throw new Error('fetch failed');
      // Someone saves on their phone just before we do, once.
      if (net.raceOnce) {
        net.raceOnce = false;
        put(href, store.get(href)!.data);
      }
      // No etag: create, only if nothing is there yet (If-None-Match: *).
      if (!etag && data !== null) {
        if (store.has(href)) return false;
        put(href, data);
        return true;
      }
      if (store.get(href)?.etag !== etag) return false;
      if (data === null) store.delete(href);
      else put(href, data);
      return true;
    },
  };
  return { store, put, net, source };
}

async function setup() {
  const db = openDb(':memory:');
  const cloud = fakeICloud();
  const now = new Date('2026-10-05T12:00:00Z');
  await syncOnce(db, cloud.source, now);
  const app = buildApp(db, { syncedEdits: { soon: () => {} } });
  const events = async () => (await app.inject({ url: '/api/events?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z&fromDay=2026-10-01&toDay=2026-11-01' }))
    .json() as { id: string; title: string; start: string; syncState: string; repeats: boolean }[];
  const later = () => new Date(Date.now() + SEND_AFTER_MS + 1000);
  const send = () => pushOutbox(db, cloud.source, later());
  return { db, app, cloud, events, send, resync: () => syncOnce(db, cloud.source, now) };
}

const titleIn = (db: DB) => (db.prepare(`SELECT title FROM events WHERE remote_id = ?`).get(DENTIST) as { title: string }).title;

describe('editing iCloud events from the wall', () => {
  it('shows an edit at once, sends it after the Undo window, then it comes back from iCloud', async () => {
    const { app, cloud, events, send, resync, db } = await setup();
    const dentist = (await events()).find((e) => e.title === 'Dentist')!;
    const res = await app.inject({ method: 'PATCH', url: `/api/events/${dentist.id}`, payload: { title: 'Dentist (Dr. Lee)', location: '1 Main St' } });
    expect(res.json()).toMatchObject({ title: 'Dentist (Dr. Lee)', syncState: 'pending_update', location: '1 Main St' });
    // Not before the Undo window.
    expect(await pushOutbox(db, cloud.source, new Date())).toEqual({ sent: 0, conflicts: 0, failed: 0 });
    expect(await send()).toEqual({ sent: 1, conflicts: 0, failed: 0 });
    expect(currentDetails(cloud.store.get(DENTIST)!.data, DENTIST, DENTIST)).toMatchObject({ title: 'Dentist (Dr. Lee)', location: '1 Main St' });
    await resync();
    expect((await events()).find((e) => e.id === dentist.id)).toMatchObject({ title: 'Dentist (Dr. Lee)', syncState: 'synced' });
    expect(titleIn(db)).toBe('Dentist (Dr. Lee)');
  });

  it('keeps an edit on the wall while offline and sends it when iCloud is back', async () => {
    const { app, cloud, events, send, resync } = await setup();
    const dentist = (await events()).find((e) => e.title === 'Dentist')!;
    await app.inject({ method: 'PATCH', url: `/api/events/${dentist.id}`, payload: { start: '2026-10-06T18:00:00.000Z', end: '2026-10-06T19:00:00.000Z', allDay: false } });
    cloud.net.down = true;
    expect(await send()).toMatchObject({ failed: 1 });
    expect((await app.inject({ url: '/api/outbox' })).json()).toMatchObject({ pending: 1, lastError: 'fetch failed', conflicts: [] });
    // A sync (with the old version) doesn't undo the waiting edit on screen.
    await resync();
    expect((await events()).find((e) => e.id === dentist.id)).toMatchObject({ start: '2026-10-06T18:00:00.000Z', syncState: 'pending_update' });
    cloud.net.down = false;
    expect(await send()).toMatchObject({ sent: 1 });
    expect(currentDetails(cloud.store.get(DENTIST)!.data, DENTIST, DENTIST)?.start).toBe('2026-10-06T18:00:00.000Z');
  });

  it('asks which version to keep when the same detail changed on a phone meanwhile', async () => {
    const { app, cloud, events, send, db } = await setup();
    const dentist = (await events()).find((e) => e.title === 'Dentist')!;
    await app.inject({ method: 'PATCH', url: `/api/events/${dentist.id}`, payload: { title: 'Dentist (wall)' } });
    cloud.put(DENTIST, cloud.store.get(DENTIST)!.data.replace('SUMMARY:Dentist', 'SUMMARY:Dentist (phone)'));
    expect(await send()).toMatchObject({ conflicts: 1 });
    const status = (await app.inject({ url: '/api/outbox' })).json();
    expect(status.conflicts).toEqual([expect.objectContaining({ mine: expect.objectContaining({ title: 'Dentist (wall)' }), theirs: expect.objectContaining({ title: 'Dentist (phone)' }) })]);
    // Use iCloud's: the wall shows the phone's version and nothing is sent.
    await app.inject({ method: 'POST', url: `/api/outbox/${status.conflicts[0].id}/resolve`, payload: { keep: 'theirs' } });
    expect(titleIn(db)).toBe('Dentist (phone)');
    expect(await send()).toMatchObject({ sent: 0 });

    // Keep mine: sent over the phone's version.
    await app.inject({ method: 'PATCH', url: `/api/events/${dentist.id}`, payload: { title: 'Dentist (wall again)' } });
    cloud.put(DENTIST, cloud.store.get(DENTIST)!.data.replace('SUMMARY:Dentist (phone)', 'SUMMARY:Dentist (phone again)'));
    await send();
    const again = (await app.inject({ url: '/api/outbox' })).json();
    await app.inject({ method: 'POST', url: `/api/outbox/${again.conflicts[0].id}/resolve`, payload: { keep: 'mine' } });
    expect(await send()).toMatchObject({ sent: 1 });
    expect(currentDetails(cloud.store.get(DENTIST)!.data, DENTIST, DENTIST)?.title).toBe('Dentist (wall again)');
  });

  it("sends an edit when the phone changed something else (and retries if iCloud changes mid-save)", async () => {
    const { app, cloud, events, send } = await setup();
    const dentist = (await events()).find((e) => e.title === 'Dentist')!;
    await app.inject({ method: 'PATCH', url: `/api/events/${dentist.id}`, payload: { title: 'Dentist (wall)' } });
    cloud.put(DENTIST, cloud.store.get(DENTIST)!.data.replace('END:VEVENT', 'LOCATION:Phone St\r\nEND:VEVENT'));
    cloud.net.raceOnce = true;
    expect(await send()).toMatchObject({ sent: 1 });
    expect(currentDetails(cloud.store.get(DENTIST)!.data, DENTIST, DENTIST)).toMatchObject({ title: 'Dentist (wall)', location: 'Phone St' });
  });

  it('deletes one day of a repeating event, with Undo before it is sent', async () => {
    const { app, cloud, events, send, resync } = await setup();
    const soccer = (await events()).filter((e) => e.title === 'Soccer');
    expect(soccer).toHaveLength(4);
    expect(soccer[1].repeats).toBe(true);
    await app.inject({ method: 'DELETE', url: `/api/events/${soccer[1].id}` });
    expect((await events()).filter((e) => e.title === 'Soccer')).toHaveLength(3);
    // Undo brings it back and nothing is sent.
    await app.inject({ method: 'POST', url: `/api/events/${soccer[1].id}/restore` });
    expect((await events()).filter((e) => e.title === 'Soccer')).toHaveLength(4);
    expect(await send()).toMatchObject({ sent: 0 });

    await app.inject({ method: 'DELETE', url: `/api/events/${soccer[1].id}` });
    expect(await send()).toMatchObject({ sent: 1 });
    await resync();
    expect((await events()).filter((e) => e.title === 'Soccer').map((e) => e.start)).toEqual(
      [soccer[0].start, soccer[2].start, soccer[3].start]);
    expect(cloud.store.get(SOCCER)!.data).toContain('EXDATE');
  });

  it('stays read-only without a calendar service that takes edits', async () => {
    const { db, cloud } = await setup();
    void cloud;
    const app = buildApp(db);
    const id = (db.prepare(`SELECT id FROM events WHERE remote_id = ?`).get(DENTIST) as { id: string }).id;
    expect((await app.inject({ method: 'PATCH', url: `/api/events/${id}`, payload: { title: 'X' } })).statusCode).toBe(409);
  });
});

describe('adding iCloud events from the wall', () => {
  it('shows a new event at once, creates it in iCloud after Undo, and keeps it the same event', async () => {
    const { app, cloud, events, send, resync, db } = await setup();
    const cal = (db.prepare(`SELECT id FROM calendars`).get() as { id: string }).id;
    const res = await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Piano recital', allDay: false, start: '2026-10-09T01:00:00.000Z', end: '2026-10-09T02:00:00.000Z', location: 'Hall', calendarId: cal } });
    expect(res.statusCode).toBe(201);
    const made = res.json();
    expect(made).toMatchObject({ title: 'Piano recital', calendarId: cal, syncState: 'pending_create' });
    // Still shown after a sync that doesn't have it yet.
    await resync();
    expect((await events()).find((e) => e.id === made.id)).toMatchObject({ syncState: 'pending_create' });
    // Renamed before it's sent: created with the new name.
    await app.inject({ method: 'PATCH', url: `/api/events/${made.id}`, payload: { title: 'Piano recital (Riley)' } });
    expect(await send()).toMatchObject({ sent: 1 });
    const created = [...cloud.store.entries()].find(([, r]) => r.data.includes('Piano recital'))!;
    expect(created[0].startsWith(CAL)).toBe(true);
    expect(currentDetails(created[1].data, created[0], created[0])).toMatchObject({ title: 'Piano recital (Riley)', location: 'Hall' });
    await resync();
    expect((await events()).find((e) => e.id === made.id)).toMatchObject({ title: 'Piano recital (Riley)', syncState: 'synced' });
  });

  it('never sends a new event deleted before the Undo window ends, and Undo brings it back', async () => {
    const { app, cloud, events, send, db } = await setup();
    const cal = (db.prepare(`SELECT id FROM calendars`).get() as { id: string }).id;
    const made = (await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Oops', allDay: true, start: '2026-10-10', end: '2026-10-11', calendarId: cal } })).json();
    await app.inject({ method: 'DELETE', url: `/api/events/${made.id}` });
    expect((await events()).some((e) => e.id === made.id)).toBe(false);
    await app.inject({ method: 'POST', url: `/api/events/${made.id}/restore` });
    expect((await events()).find((e) => e.id === made.id)).toMatchObject({ title: 'Oops', syncState: 'pending_create' });
    await app.inject({ method: 'DELETE', url: `/api/events/${made.id}` });
    await send();
    expect([...cloud.store.values()].some((r) => r.data.includes('Oops'))).toBe(false);
  });

  it('only adds to calendars that take changes', async () => {
    const { app, db } = await setup();
    const cal = (db.prepare(`SELECT id FROM calendars`).get() as { id: string }).id;
    db.prepare('UPDATE calendars SET writable = 0').run();
    const res = await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'X', allDay: true, start: '2026-10-10', end: '2026-10-11', calendarId: cal } });
    expect(res.statusCode).toBe(409);
  });
});
