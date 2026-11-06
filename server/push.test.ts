import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { sendOnce, type Alert, type Pusher, type Subscription } from './push.ts';

function setup(withPush = true) {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO members (id, name, color) VALUES ('alex', 'Alex', '#000000')`).run();
  const sent: { endpoint: string; alert: Alert }[] = [];
  const gone = new Set<string>();
  const pusher: Pusher = {
    publicKey: 'public-key',
    async send(sub: Subscription, alert: Alert) {
      if (gone.has(sub.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, alert });
    },
  };
  const app = buildApp(db, withPush ? { push: pusher } : {});
  const call = async (method: string, url: string, payload?: object) => {
    const res = await app.inject({ method: method as 'GET', url, payload });
    return { status: res.statusCode, body: res.body ? res.json() : undefined };
  };
  return { db, call, pusher, sent, gone };
}

const sub = (n: string, timeZone = 'America/Los_Angeles') =>
  ({ subscription: { endpoint: `https://push.test/${n}`, keys: { p256dh: 'p', auth: 'a' } }, timeZone });
const devices = (db: ReturnType<typeof openDb>) =>
  db.prepare('SELECT * FROM push_devices ORDER BY endpoint').all() as { id: string; endpoint: string; member_id: string | null; time_zone: string; subscription: string; created_at: string }[];
const alert: Alert = { title: 'Hi', body: 'There', url: '/', tag: 't' };

describe('push', () => {
  it('saves a device, again keeps one, and removes it', async () => {
    const { db, call } = setup();
    expect((await call('GET', '/api/push/key')).body).toEqual({ publicKey: 'public-key' });
    expect((await call('POST', '/api/push', sub('a'))).status).toBe(204);
    expect((await call('POST', '/api/push', sub('a', 'Europe/London'))).status).toBe(204);
    expect(devices(db)).toMatchObject([{ endpoint: 'https://push.test/a', time_zone: 'Europe/London' }]);
    expect((await call('POST', '/api/push', sub('b', 'Mars/Olympus'))).status).toBe(400);
    expect((await call('POST', '/api/push', { ...sub('c'), subscription: { endpoint: 'http://push.test/c', keys: { p256dh: 'p', auth: 'a' } } })).status).toBe(400);
    expect((await call('DELETE', '/api/push', { endpoint: 'https://push.test/a' })).status).toBe(204);
    expect(devices(db)).toEqual([]);
  });

  it('is off without push keys', async () => {
    const { call } = setup(false);
    expect((await call('GET', '/api/push/key')).status).toBe(404);
    expect((await call('POST', '/api/push', sub('a'))).status).toBe(404);
  });

  it('sends each thing once, and forgets devices that are gone', async () => {
    const { db, call, pusher, sent, gone } = setup();
    await call('POST', '/api/push', sub('a'));
    await call('POST', '/api/push', sub('b'));
    gone.add('https://push.test/b');
    await sendOnce(db, pusher, devices(db), 'k1', alert);
    await sendOnce(db, pusher, devices(db), 'k1', alert);
    expect(sent.map((s) => s.endpoint)).toEqual(['https://push.test/a']);
    expect(devices(db).map((d) => d.endpoint)).toEqual(['https://push.test/a']);
  });
});
