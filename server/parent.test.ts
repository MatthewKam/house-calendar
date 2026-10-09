import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { hashPin } from './auth.ts';

// The parent lock: with a PIN set, changes to events, tasks, jars, settings, photos and lists need
// the master PIN; what the kids do themselves (ticking, stars, redeeming, uploading) doesn't.
let app: ReturnType<typeof buildApp>;
let cookie: string;
const send = (method: string, url: string, payload?: object) =>
  app.inject({ method: method as 'POST', url, headers: { cookie }, payload });
const event = { title: 'Dentist', allDay: false, start: '2099-01-01T10:00:00.000Z', end: '2099-01-01T11:00:00.000Z', memberIds: [] };

beforeEach(async () => {
  const db = openDb(':memory:');
  app = buildApp(db);
  const res = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '1111' } });
  cookie = String(res.headers['set-cookie']).split(';')[0];
  db.prepare('UPDATE auth SET master_hash = ? WHERE id = 1').run(hashPin('1608'));
});

describe('the parent lock', () => {
  it('refuses parent changes until unlocked with the master PIN, then locks again', async () => {
    expect((await send('GET', '/api/auth/status')).json()).toMatchObject({ signedIn: true, parent: false });
    const locked = await send('POST', '/api/events', event);
    expect(locked.statusCode).toBe(403);
    expect(locked.json()).toMatchObject({ locked: true });
    // The family PIN isn't the parent PIN.
    expect((await send('POST', '/api/auth/parent', { pin: '1111' })).statusCode).toBe(403);
    expect((await send('POST', '/api/auth/parent', { pin: '1608' })).json()).toEqual({ parent: true, parentKept: false });
    expect((await send('POST', '/api/events', event)).statusCode).toBe(201);
    await send('POST', '/api/auth/parent/lock');
    expect((await send('POST', '/api/events', event)).statusCode).toBe(403);
  });

  it("leaves the kids' own things open", async () => {
    // Choosing month or week, and ticking a task (made by a parent first).
    expect((await send('PUT', '/api/settings/view', { value: 'week' })).statusCode).toBeLessThan(300);
    expect((await send('PUT', '/api/settings/homeAddress', { value: '1 Main St' })).statusCode).toBe(403);
    const member = (await send('POST', '/api/members', { name: 'Riley', color: '#2fa66a' }));
    expect(member.statusCode).toBe(403);
    await send('POST', '/api/auth/parent', { pin: '1608' });
    const riley = (await send('POST', '/api/members', { name: 'Riley', color: '#2fa66a' })).json().id;
    const task = (await send('POST', '/api/tasks', { title: 'Make bed', memberId: riley, days: [0, 1, 2, 3, 4, 5, 6] })).json();
    await send('POST', '/api/auth/parent/lock');
    expect((await send('PUT', `/api/tasks/${task.id}/done/${riley}/2026-10-08`)).statusCode).toBe(204);
    expect((await send('PATCH', `/api/tasks/${task.id}`, { title: 'Tidy room' })).statusCode).toBe(403);
  });

  it("keeps a parent's own phone unlocked", async () => {
    expect((await send('POST', '/api/auth/parent', { pin: '1608', keep: true })).json()).toEqual({ parent: true, parentKept: true });
    expect((await send('GET', '/api/auth/status')).json()).toMatchObject({ parent: true, parentKept: true });
  });

  it('leaves everything open when no PIN is set (as before)', async () => {
    const open = buildApp(openDb(':memory:'));
    expect((await open.inject({ method: 'POST', url: '/api/events', payload: event })).statusCode).toBe(201);
  });
});
