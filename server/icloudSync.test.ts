import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { icloudCalendars, ICloudLoginError } from './icloudSync.ts';
import { pushOutbox, SEND_AFTER_MS } from './outbox.ts';
import { syncOnce } from './sync.ts';
import { sealer } from './secrets.ts';
import type { CalendarSource, CalendarWriter } from './providers/types.ts';

const ms = (...responses: string[]) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${responses.join('')}</d:multistatus>`;
const ok = (href: string, props: string) =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Swim',
  'DTSTART:20261106T160000Z', 'DTEND:20261106T170000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

/** iCloud's CalDAV answers for one account with one calendar; any other password gets a 401. */
function fakeICloud(password: string) {
  const auths: string[] = [];
  const routes: Record<string, string> = {
    'PROPFIND https://caldav.icloud.com/': ms(ok('/', '<d:current-user-principal><d:href>/1/principal/</d:href></d:current-user-principal>')),
    'PROPFIND https://caldav.icloud.com/1/principal/': ms(ok('/1/principal/',
      '<c:calendar-home-set><d:href>https://p1-caldav.icloud.com/1/calendars/</d:href></c:calendar-home-set>')),
    'PROPFIND https://p1-caldav.icloud.com/1/calendars/': ms(
      ok('/1/calendars/home/', '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Home</d:displayname>')),
    'REPORT https://p1-caldav.icloud.com/1/calendars/home/': ms(
      ok('/1/calendars/home/a.ics', `<d:getetag>"1"</d:getetag><c:calendar-data>${ICS}</c:calendar-data>`)),
  };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const auth = (init.headers as Record<string, string>).authorization;
    auths.push(auth);
    if (auth !== `Basic ${Buffer.from(`sam@icloud.com:${password}`).toString('base64')}`) return new Response('', { status: 401 });
    const body = routes[`${init.method} ${url}`];
    return new Response(body ?? '', { status: body ? 207 : 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, auths };
}

const log = { info: () => {}, error: () => {} };

function setup() {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO members (id, name, color) VALUES ('sam', 'Sam', '#000000')`).run();
  const cloud = fakeICloud('abcd-efgh-ijkl-mnop');
  const icloud = icloudCalendars(db, { sealer: sealer(randomBytes(32)), classify: null, log, fetchImpl: cloud.fetchImpl });
  return { db, icloud };
}

describe('iCloud connections', () => {
  it('checks the password, stores it encrypted, syncs, and takes the calendars away when removed', async () => {
    const { db, icloud } = setup();
    // Pasted with stray spaces, and a capital in the Apple ID.
    await icloud.connect({ memberId: 'sam', appleId: ' Sam@iCloud.com ', password: ' abcd-efgh-ijkl-mnop ' });
    expect(JSON.stringify(db.prepare('SELECT * FROM connections').all())).not.toContain('abcd-efgh-ijkl-mnop');
    await vi.waitFor(() => expect(icloud.list()[0]).toMatchObject({ account: 'sam@icloud.com', memberId: 'sam', calendars: 1, lastError: null }));
    const id = icloud.list()[0].id;
    expect(db.prepare(`SELECT name, source, writable FROM calendars WHERE provider = 'icloud'`).all())
      .toEqual([{ name: 'Home', source: `icloud:${id}`, writable: 1 }]);
    expect(db.prepare('SELECT title FROM events').all()).toEqual([{ title: 'Swim' }]);

    await icloud.remove(id);
    expect(db.prepare(`SELECT COUNT(*) n FROM calendars WHERE provider = 'icloud'`).get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) n FROM events').get()).toEqual({ n: 0 });
    icloud.stop();
  });

  it('turns down a wrong password without keeping it', async () => {
    const { db, icloud } = setup();
    await expect(icloud.connect({ memberId: 'sam', appleId: 'sam@icloud.com', password: 'wrong' })).rejects.toBeInstanceOf(ICloudLoginError);
    expect(db.prepare('SELECT COUNT(*) n FROM connections').get()).toEqual({ n: 0 });
  });

  it('connects from Settings, and says plainly when iCloud says no', async () => {
    const { db, icloud } = setup();
    const app = buildApp(db, { icloud });
    const bad = await app.inject({ method: 'POST', url: '/api/connections/icloud', payload: { appleId: 'sam@icloud.com', password: 'nope' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/didn't accept/);
    const good = await app.inject({ method: 'POST', url: '/api/connections/icloud', payload: { appleId: 'sam@icloud.com', password: 'abcd-efgh-ijkl-mnop' } });
    expect(good.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/connections' })).json().icloud).toHaveLength(1);
    icloud.stop();
  });
});

describe('edits with several iCloud accounts', () => {
  it('each account sends only the edits to its own calendars', async () => {
    const db = openDb(':memory:');
    const account = (key: string, cal: string) => {
      const writes: string[] = [];
      const data = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `UID:${key}`, `SUMMARY:Dentist ${key}`,
        'DTSTART:20261106T160000Z', 'DTEND:20261106T170000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const source: CalendarSource & CalendarWriter = {
        id: 'icloud', key,
        listCalendars: async () => [{ remoteId: cal, name: key }],
        fetchRange: async () => [{ remoteId: `${cal}e.ics`, etag: '"1"', title: `Dentist ${key}`, allDay: false,
          start: '2026-11-06T16:00:00.000Z', end: '2026-11-06T17:00:00.000Z' }],
        getEvent: async () => ({ data, etag: '"1"' }),
        writeEvent: async (href) => {
          writes.push(href);
          return true;
        },
      };
      return { source, writes };
    };
    const a = account('icloud:a', 'https://p1.icloud.com/a/');
    const b = account('icloud:b', 'https://p1.icloud.com/b/');
    const now = new Date('2026-11-04T12:00:00Z');
    await syncOnce(db, a.source, now);
    await syncOnce(db, b.source, now);

    const app = buildApp(db, { syncedEdits: { soon: () => {} } });
    const ev = db.prepare(`SELECT e.id FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE c.source = 'icloud:a'`).get() as { id: string };
    expect((await app.inject({ method: 'PATCH', url: `/api/events/${ev.id}`, payload: { title: 'Dentist (Sam)' } })).statusCode).toBe(200);

    const later = new Date(Date.now() + SEND_AFTER_MS + 1000);
    expect(await pushOutbox(db, b.source, later, 'icloud:b')).toEqual({ sent: 0, conflicts: 0, failed: 0 });
    expect(await pushOutbox(db, a.source, later, 'icloud:a')).toEqual({ sent: 1, conflicts: 0, failed: 0 });
    expect(a.writes).toEqual(['https://p1.icloud.com/a/e.ics']);
    expect(b.writes).toEqual([]);
  });
});
