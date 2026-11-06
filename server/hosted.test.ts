import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import inject from 'light-my-request';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { openAccounts, type AccountsDB } from './accounts.ts';
import { householdRegistry } from './households.ts';
import { adoptLegacy, buildServer } from './hosted.ts';

// Accounts, households and the guardian PIN, through the front server.
let dir: string;
let accounts: AccountsDB;
let server: ReturnType<typeof buildServer>;
const codes = new Map<string, string>();
const connected: { memberId: string | null; account: string; refreshToken: string }[] = [];

const event = { title: 'Dentist', allDay: false, start: '2099-01-01T10:00:00.000Z', end: '2099-01-01T11:00:00.000Z', memberIds: [] };

/** A device: keeps its cookie between calls, like a browser. */
function device() {
  let cookie = '';
  const call = async (method: string, url: string, payload?: object) => {
    const res = await inject(server.handle, { method: method as 'GET', url, payload, headers: cookie ? { cookie } : {} });
    const set = res.headers['set-cookie'];
    if (set) cookie = String(set).split(';')[0];
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
  };
  return {
    get: (url: string) => call('GET', url),
    raw: (url: string) => inject(server.handle, { url, headers: cookie ? { cookie } : {} }),
    post: (url: string, payload: object = {}) => call('POST', url, payload),
    put: (url: string, payload: object) => call('PUT', url, payload),
    patch: (url: string, payload: object) => call('PATCH', url, payload),
    del: (url: string) => call('DELETE', url),
    async signIn(email: string) {
      await call('POST', '/api/account/email/start', { email });
      return call('POST', '/api/account/email/verify', { email, code: codes.get(email)! });
    },
  };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'household-'));
  accounts = openAccounts(':memory:');
  const households = householdRegistry((h) => {
    const db = openDb(resolve(dir, h.db_file));
    const app = buildApp(db, { push: { publicKey: 'key', send: async () => {} } });
    return { app, db, google: { connect: (c) => void connected.push(c) }, close: async () => { await app.close(); db.close(); } };
  });
  server = buildServer(accounts, households, {
    dataDir: dir, logger: false,
    sendCode: async (email, code) => void codes.set(email, code),
    googleCalendar: {
      authUrl: (redirect, state, hint) => `https://google.test/auth?${new URLSearchParams({ redirect, state, hint: hint ?? '' })}`,
      exchange: async (code, redirect) => ({ refreshToken: `refresh-${code}`, account: redirect.endsWith('/api/account/google/callback') ? 'alex@gmail.com' : '?' }),
      accessToken: async () => ({ token: 't', expiresAt: 0 }),
      revoke: async () => {},
    },
    google: { clientId: 'web', verify: async (t) => ({ subject: `g-${t}`, email: `${t.split('.')[0]}@gmail.com`, name: 'Pat Google' }) },
  });
  await server.app.ready();
});
afterEach(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A guardian with a household. */
async function guardian() {
  const phone = device();
  await phone.signIn('alex@example.com');
  const made = await phone.post('/api/account/households', { name: 'The Kims', yourName: 'Alex' });
  expect(made.status).toBe(201);
  return phone;
}

describe('signing in', () => {
  it('signs in by email code, creates a household, and reaches its data', async () => {
    const phone = device();
    expect((await phone.get('/api/members')).status).toBe(401);
    expect((await phone.get('/api/auth/status')).body).toEqual({ signedIn: false });
    await phone.post('/api/account/email/start', { email: 'Alex@Example.com' });
    expect((await phone.post('/api/account/email/verify', { email: 'alex@example.com', code: '000000x' })).status).toBe(401);
    const ok = await phone.post('/api/account/email/verify', { email: 'alex@example.com', code: codes.get('alex@example.com')! });
    expect(ok.body).toMatchObject({ signedIn: true, kind: 'user', household: null, user: { email: 'alex@example.com' } });
    // Signed in, but in no household yet.
    expect((await phone.get('/api/members')).status).toBe(401);

    const made = await phone.post('/api/account/households', { name: 'The Kims', yourName: 'Alex' });
    expect(made.body).toMatchObject({ household: { name: 'The Kims' }, role: 'guardian', parent: true, parentAlways: true, me: { name: 'Alex' }, unlockedBy: null });
    const members = await phone.get('/api/members');
    expect(members.body).toEqual([expect.objectContaining({ name: 'Alex' })]);
    expect(made.body.memberId).toBe(members.body[0].id);
    // A guardian's own phone can change anything.
    expect((await phone.post('/api/events', event)).status).toBe(201);

    await phone.post('/api/account/signout');
    expect((await phone.get('/api/members')).status).toBe(401);
  });

  it('treats Google and email with the same address as one person', async () => {
    const a = device();
    await a.signIn('pat@gmail.com');
    await a.post('/api/account/households', { name: 'Pats', yourName: 'Pat' });
    const b = device();
    const res = await b.post('/api/account/signin/google', { idToken: 'pat.fake-token' });
    expect(res.body).toMatchObject({ household: { name: 'Pats' }, role: 'guardian' });
  });
});

describe('invites', () => {
  it('adds a second guardian, whose PIN also opens the wall', async () => {
    const alex = await guardian();
    const invite = await alex.post('/api/account/invites', { kind: 'guardian', name: 'Jordan' });
    expect(invite.body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const jordan = device();
    // Not signed in: a guardian code needs an account.
    expect((await jordan.post('/api/account/join', { code: invite.body.code })).status).toBe(401);
    await jordan.signIn('jordan@example.com');
    expect((await jordan.get(`/api/account/join/${invite.body.code.toLowerCase()}`)).body).toMatchObject({ kind: 'guardian', household: 'The Kims', for: 'Jordan' });
    expect((await jordan.post('/api/account/join', { code: invite.body.code })).body).toMatchObject({ role: 'guardian', household: { name: 'The Kims' } });
    // One use only.
    expect((await device().get(`/api/account/join/${invite.body.code}`)).status).toBe(404);
    expect((await jordan.get('/api/members')).body.map((m: { name: string }) => m.name)).toEqual(['Alex', 'Jordan']);

    // The wall needs a guardian with a PIN.
    expect((await alex.post('/api/account/invites', { kind: 'wall' })).status).toBe(400);
    expect((await jordan.put('/api/account/pin', { pin: '12' })).status).toBe(400);
    await jordan.put('/api/account/pin', { pin: '2468' });
    await alex.put('/api/account/pin', { pin: '13579' });
    // Different lengths: the number pad can't check as the last digit goes in. The same: it can.
    expect((await alex.get('/api/auth/status')).body).toMatchObject({ guardianPins: 2, pinLength: null });
    await alex.put('/api/account/pin', { pin: '1357' });
    expect((await alex.get('/api/auth/status')).body).toMatchObject({ guardianPins: 2, pinLength: 4 });
    const wallCode = (await alex.post('/api/account/invites', { kind: 'wall' })).body.code;

    const wall = device();
    expect((await wall.post('/api/account/join', { code: wallCode })).body).toMatchObject({ kind: 'wall', entered: false });
    expect((await wall.get('/api/members')).status).toBe(401);
    // A PIN from before lengths were kept is learned the first time it's typed right.
    accounts.prepare(`UPDATE memberships SET pin_length = NULL`).run();
    expect((await alex.get('/api/auth/status')).body.pinLength).toBe(null);
    expect((await wall.post('/api/auth/enter', { pin: '0000' })).body).toEqual({ error: 'Wrong PIN' });
    // Either guardian's PIN. Entering also unlocks it for changes.
    expect((await wall.post('/api/auth/enter', { pin: '2468' })).body).toMatchObject({ entered: true, parent: true, parentAlways: false, role: 'wall', me: null, unlockedBy: 'Jordan' });
    expect((accounts.prepare(`SELECT pin_length FROM memberships WHERE pin_length IS NOT NULL`).all())).toEqual([{ pin_length: 4 }]);
    expect((await wall.post('/api/events', event)).status).toBe(201);
    await wall.post('/api/auth/parent/lock');
    const locked = await wall.post('/api/events', event);
    expect(locked).toMatchObject({ status: 403, body: { locked: true } });
    // Looking (and the kids' own things) still works while locked.
    expect((await wall.get('/api/events?from=2099-01-01T00:00:00Z&to=2099-01-02T00:00:00Z&fromDay=2099-01-01&toDay=2099-01-02')).status).toBe(200);
    expect((await wall.post('/api/auth/parent/lock')).body.unlockedBy).toBeNull();
    expect((await wall.post('/api/auth/parent', { pin: '1357' })).body.unlockedBy).toBe('Alex');
    expect((await wall.post('/api/events', event)).status).toBe(201);

    // Locking the wall goes back to the PIN screen.
    await wall.post('/api/auth/lock-wall');
    expect((await wall.get('/api/members')).status).toBe(401);

    // Settings lists both guardians and the wall; a guardian signs the wall out.
    const household = (await alex.get('/api/account/household')).body;
    expect(household.people).toMatchObject([{ name: 'Alex', role: 'guardian', account: true, hasPin: true }, { name: 'Jordan', role: 'guardian' }]);
    const wallDevice = household.devices.find((d: { kind: string }) => d.kind === 'wall');
    expect(wallDevice.who).toBe('Wall');
    expect((await alex.post(`/api/auth/devices/${wallDevice.id}/sign-out`)).status).toBe(204);
    expect((await wall.get('/api/auth/status')).body).toEqual({ signedIn: false });
  });

  it("adds a kid's device without an account, which a guardian's PIN unlocks", async () => {
    const alex = await guardian();
    await alex.put('/api/account/pin', { pin: '1357' });
    const code = (await alex.post('/api/account/invites', { kind: 'kid', name: 'Sam' })).body.code;
    const ipad = device();
    expect((await ipad.post('/api/account/join', { code })).body).toMatchObject({ kind: 'device', role: 'kid', parent: false });
    const sam = (await ipad.get('/api/members')).body.find((m: { name: string }) => m.name === 'Sam');
    expect((await ipad.get('/api/auth/status')).body.memberId).toBe(sam.id);
    expect((await ipad.post('/api/events', event)).status).toBe(403);
    // A guardian can't be removed down to none, but a kid's sign-in can.
    const people = (await alex.get('/api/account/household')).body.people;
    expect((await ipad.get('/api/account/household')).status).toBe(403);
    expect((await alex.del(`/api/account/memberships/${people[0].membershipId}`)).status).toBe(400);
    expect((await alex.del(`/api/account/memberships/${people[1].membershipId}`)).status).toBe(204);
    expect((await ipad.get('/api/members')).status).toBe(401);
    expect((await ipad.get('/api/auth/status')).body).toEqual({ signedIn: false });
  });

  it("checks a guardian's PIN for leaving kid mode, even on a guardian's own phone", async () => {
    const alex = await guardian();
    await alex.put('/api/account/pin', { pin: '1357' });
    expect((await alex.post('/api/auth/check-pin', { pin: '0000' })).status).toBe(403);
    expect((await alex.post('/api/auth/check-pin', { pin: '1357' })).status).toBe(204);
    // Nothing else changes: still a guardian's own phone.
    expect((await alex.get('/api/auth/status')).body).toMatchObject({ parent: true, parentAlways: true });
    expect((await device().post('/api/auth/check-pin', { pin: '1357' })).status).toBe(401);
  });

  it('locks out a device after five wrong PINs', async () => {
    const alex = await guardian();
    await alex.put('/api/account/pin', { pin: '1357' });
    const wall = device();
    await wall.post('/api/account/join', { code: (await alex.post('/api/account/invites', { kind: 'wall' })).body.code });
    for (let i = 0; i < 5; i++) await wall.post('/api/auth/enter', { pin: '0000' });
    expect((await wall.post('/api/auth/enter', { pin: '1357' })).body.error).toMatch(/Too many/);
  });
});

describe('connecting Google Calendar', () => {
  it("sends the person to Google and back, and hands their account to their household", async () => {
    connected.length = 0;
    const alex = await guardian();
    const start = await alex.raw('/api/account/google/connect');
    expect(start.statusCode).toBe(302);
    const google = new URL(String(start.headers.location));
    expect(google.searchParams.get('hint')).toBe('alex@example.com');
    const state = google.searchParams.get('state')!;

    // Someone else's browser can't finish it.
    const other = device();
    expect((await other.raw(`/api/account/google/callback?code=c&state=${state}`)).headers.location).toMatch(/calendar=That%20took/);
    // The same state works once, from the device that started it.
    const again = new URL(String((await alex.raw('/api/account/google/connect')).headers.location)).searchParams.get('state')!;
    const done = await alex.raw(`/api/account/google/callback?code=c1&state=${again}`);
    expect(done.headers.location).toBe('/?calendar=connected');
    expect(connected).toEqual([{ memberId: (await alex.get('/api/auth/status')).body.memberId, account: 'alex@gmail.com', refreshToken: 'refresh-c1' }]);
    expect((await alex.raw(`/api/account/google/callback?code=c1&state=${again}`)).headers.location).toMatch(/took%20too%20long/);

    // The wall has no account of its own to connect.
    await alex.put('/api/account/pin', { pin: '1357' });
    const wall = device();
    await wall.post('/api/account/join', { code: (await alex.post('/api/account/invites', { kind: 'wall' })).body.code });
    expect((await wall.raw('/api/account/google/connect')).headers.location).toMatch(/your%20own%20account/);
  });
});

describe('the household from before accounts', () => {
  it('is claimed with the logged code by picking who you are', async () => {
    const file = join(dir, 'calendar.db');
    const old = openDb(file);
    old.prepare(`INSERT INTO members (id, name, color) VALUES ('m1', 'Matt', '#2f7de1'), ('m2', 'Riley', '#e0457b')`).run();
    old.close();
    let logged = '';
    adoptLegacy(accounts, dir, file, join(dir, 'photos'), (m) => (logged = m));
    expect(accounts.prepare('SELECT db_file, photos_dir FROM households').get()).toEqual({ db_file: 'calendar.db', photos_dir: 'photos' });
    const code = /([A-Z2-9]{4}-[A-Z2-9]{4})/.exec(logged)![1];

    const phone = device();
    await phone.signIn('matt@example.com');
    expect((await phone.get(`/api/account/join/${code}`)).body).toMatchObject({ kind: 'guardian', household: 'Home', choose: [{ id: 'm1', name: 'Matt' }, { id: 'm2', name: 'Riley' }] });
    expect((await phone.post('/api/account/join', { code })).status).toBe(400);
    expect((await phone.post('/api/account/join', { code, memberId: 'm1' })).body).toMatchObject({ role: 'guardian', memberId: 'm1' });
    expect((await phone.get('/api/members')).body).toHaveLength(2);
    // Claimed: no new code on the next start.
    logged = '';
    adoptLegacy(accounts, dir, file, join(dir, 'photos'), (m) => (logged = m));
    expect(logged).toBe('');
  });
});

describe('privacy', () => {
  const range = '/api/events?from=2099-01-01T00:00:00Z&to=2099-01-02T00:00:00Z&fromDay=2099-01-01&toDay=2099-01-02';
  const at = (h: number) => `2099-01-01T${String(h).padStart(2, '0')}:00:00.000Z`;

  it("shows each person, kid and the wall only what they may see", async () => {
    const alex = await guardian();
    await alex.put('/api/account/pin', { pin: '1357' });
    // Jordan, a second guardian; Sam, a kid on their own device; and the wall.
    const jordan = device();
    await jordan.signIn('jordan@example.com');
    await jordan.post('/api/account/join', { code: (await alex.post('/api/account/invites', { kind: 'guardian', name: 'Jordan' })).body.code });
    const ipad = device();
    await ipad.post('/api/account/join', { code: (await alex.post('/api/account/invites', { kind: 'kid', name: 'Sam' })).body.code });
    const wall = device();
    await wall.post('/api/account/join', { code: (await alex.post('/api/account/invites', { kind: 'wall' })).body.code });
    await wall.post('/api/auth/enter', { pin: '1357' });
    await wall.post('/api/auth/parent/lock');

    const people = (await alex.get('/api/members')).body as { id: string; name: string }[];
    const id = (name: string) => people.find((p) => p.name === name)!.id;
    // Sam is a kid (born a few years ago).
    const born = `${new Date().getFullYear() - 4}-01-01`;
    expect((await alex.patch(`/api/members/${id('Sam')}`, { birthdate: born })).status).toBe(200);

    const add = (title: string, h: number, memberIds: string[], visibility?: string) =>
      alex.post('/api/events', { title, allDay: false, start: at(h), end: at(h + 1), memberIds, location: '1 Main St', ...(visibility ? { visibility } : {}) });
    const therapy = (await add('Therapy', 9, [id('Alex')], 'private')).body;
    const work = (await add('Work call', 11, [id('Alex')], 'busy')).body;
    await add("Sam's doctor", 13, [id('Sam')], 'private');
    await add('Park', 15, []);

    const seen = async (who: ReturnType<typeof device>) =>
      ((await who.get(range)).body as { title: string; location: string | null; busy?: boolean }[]).map((e) => (e.busy ? `busy:${e.location}` : e.title));
    expect(await seen(alex)).toEqual(['Therapy', 'Work call', "Sam's doctor", 'Park']);
    // Another guardian: not Alex's private event, Alex's busy time, but all of the kids' events.
    expect(await seen(jordan)).toEqual(['busy:null', "Sam's doctor", 'Park']);
    expect(await seen(ipad)).toEqual(['busy:null', "Sam's doctor", 'Park']);
    // The wall is no one in particular.
    expect(await seen(wall)).toEqual(['busy:null', 'Park']);

    // What can't be seen can't be opened or changed.
    expect((await jordan.patch(`/api/events/${therapy.id}`, { title: 'x' })).status).toBe(404);
    expect((await jordan.patch(`/api/events/${work.id}`, { title: 'x' })).status).toBe(403);
    expect((await jordan.put(`/api/events/${work.id}/visibility`, { visibility: 'everyone' })).status).toBe(403);
    // Alex makes it everyone's again.
    expect((await alex.put(`/api/events/${work.id}/visibility`, { visibility: null })).body.visibility).toBe('everyone');
    expect(await seen(wall)).toEqual(['Work call', 'Park']);

    // Lists: a kid adds and ticks, but naming and the when and who are a parent's.
    const groceries = (await alex.post('/api/lists', { title: 'Groceries' })).body[0];
    expect((await ipad.post('/api/lists', { title: 'Mine' })).status).toBe(403);
    const milk = (await ipad.post(`/api/lists/${groceries.id}/items`, { title: 'Milk' })).body[0].items[0];
    expect((await ipad.patch(`/api/lists/items/${milk.id}`, { done: true })).status).toBe(200);
    expect((await ipad.patch(`/api/lists/items/${milk.id}`, { title: 'Chocolate milk' })).status).toBe(403);
    expect((await ipad.patch(`/api/lists/items/${milk.id}`, { due: '2099-01-01' })).status).toBe(403);
    expect((await ipad.del(`/api/lists/items/${milk.id}`)).status).toBe(403);

    // Alerts on phones are for grown-ups.
    const sub = (n: string) => ({ subscription: { endpoint: `https://push.test/${n}`, keys: { p256dh: 'p', auth: 'a' } }, timeZone: 'America/Los_Angeles' });
    expect((await alex.post('/api/push', sub('alex'))).status).toBe(204);
    expect((await ipad.post('/api/push', sub('ipad'))).status).toBe(403);
    expect((await wall.post('/api/push', sub('wall'))).status).toBe(403);
    // Saying and snapping are a grown-up's too.
    expect((await ipad.post('/api/capture', { text: 'Milk', timeZone: 'UTC' })).status).toBe(403);

    // A kid's own device puts stars in jars only with a parent there.
    const place = await ipad.post('/api/rewards/place', { memberId: id('Sam'), today: '2099-01-01', places: [] });
    expect(place).toMatchObject({ status: 403, body: { locked: true } });
  });
});
