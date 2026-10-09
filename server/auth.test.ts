import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

let app: ReturnType<typeof buildApp>;
const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie']).split(';')[0];
const get = (url: string, cookie?: string) => app.inject({ url, headers: cookie ? { cookie } : {} });
const post = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, payload, headers: cookie ? { cookie } : {} });

beforeEach(() => {
  app = buildApp(openDb(':memory:'), { remindersToken: 't' });
});

describe('family PIN', () => {
  it('leaves the app open until a PIN is set, then asks every device to sign in', async () => {
    expect((await get('/api/members')).statusCode).toBe(200);
    expect((await get('/api/auth/status')).json()).toEqual({ pinSet: false, masterSet: false, signedIn: true, parent: true, parentKept: false });
    // Setting it signs this device in.
    const set = await post('/api/auth/pin', { pin: '2468' });
    const wall = cookieOf(set);
    expect((await get('/api/members', wall)).statusCode).toBe(200);
    // Another device isn't signed in.
    expect((await get('/api/members')).statusCode).toBe(401);
    expect((await get('/api/auth/status')).json()).toEqual({ pinSet: true, masterSet: false, signedIn: false, parent: false, parentKept: false });
    // The phones' Shortcut still works with its token.
    expect((await app.inject({ url: '/api/reminders/phone/pending?device=x', headers: { authorization: 'Bearer t' } })).statusCode).toBe(200);
  });

  it('signs a device in with the right PIN, and locks it out after five wrong ones', async () => {
    await post('/api/auth/pin', { pin: '2468' });
    expect((await post('/api/auth/login', { pin: '1111' })).json().error).toBe('Wrong PIN');
    const ok = await post('/api/auth/login', { pin: '2468' });
    expect(ok.statusCode).toBe(200);
    expect(String(ok.headers['set-cookie'])).toMatch(/HttpOnly; SameSite=Lax/);
    expect((await get('/api/members', cookieOf(ok))).statusCode).toBe(200);
    for (let i = 0; i < 5; i++) await post('/api/auth/login', { pin: '0000' });
    expect((await post('/api/auth/login', { pin: '2468' })).statusCode).toBe(429);
  });

  it('lists signed-in devices, signs one out, and changes the PIN', async () => {
    const wall = cookieOf(await post('/api/auth/pin', { pin: '2468' }));
    const phone = cookieOf(await post('/api/auth/login', { pin: '2468' }));
    const devices = (await get('/api/auth/devices', wall)).json();
    expect(devices).toHaveLength(2);
    expect(devices.filter((d: any) => d.thisDevice)).toHaveLength(1);
    const other = devices.find((d: any) => !d.thisDevice);
    // Signing a device out is for parents: refused until unlocked (with no master PIN, the family PIN does).
    expect((await post(`/api/auth/devices/${other.id}/sign-out`, {}, wall)).statusCode).toBe(403);
    expect((await post('/api/auth/parent', { pin: '2468' }, wall)).statusCode).toBe(200);
    expect((await post(`/api/auth/devices/${other.id}/sign-out`, {}, wall)).statusCode).toBe(204);
    expect((await get('/api/members', phone)).statusCode).toBe(401);
    // Changing needs the current PIN.
    expect((await post('/api/auth/pin', { pin: '1357', currentPin: '0000' }, wall)).statusCode).toBe(401);
    expect((await post('/api/auth/pin', { pin: '1357', currentPin: '2468' }, wall)).statusCode).toBe(200);
    expect((await post('/api/auth/login', { pin: '1357' })).statusCode).toBe(200);
    // And not from a device that isn't signed in.
    expect((await post('/api/auth/pin', { pin: '9999', currentPin: '1357' })).statusCode).toBe(401);
  });

  it('needs the master PIN, once there is one, to change the family PIN; it signs in too', async () => {
    const { hashPin } = await import('./auth.ts');
    const db = openDb(':memory:');
    app = buildApp(db);
    const wall = cookieOf(await post('/api/auth/pin', { pin: '2468' }));
    db.prepare('UPDATE auth SET master_hash = ? WHERE id = 1').run(hashPin('1608'));
    expect((await get('/api/auth/status', wall)).json()).toMatchObject({ masterSet: true });
    // The family PIN alone can't change it any more.
    expect((await post('/api/auth/pin', { pin: '1111', currentPin: '2468' }, wall)).json().error).toBe('The master PIN is wrong');
    expect((await post('/api/auth/pin', { pin: '1111', masterPin: '1608' }, wall)).statusCode).toBe(200);
    expect((await post('/api/auth/login', { pin: '1111' })).statusCode).toBe(200);
    expect((await post('/api/auth/login', { pin: '1608' })).statusCode).toBe(200);
    // The master PIN itself can't be changed from the app.
    expect((await post('/api/auth/master', { masterPin: '4321', currentMasterPin: '1608' }, wall)).statusCode).toBe(404);
  });
});
