import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import webpush from 'web-push';
import type { DB } from './db.ts';

// Alerts on people's phones (web push). A grown-up turns them on per device; the browser gives a
// subscription, kept here with whose device it is and its time zone. Kid and wall devices don't get
// them. Sending is replaced in tests.

/** A browser's push subscription, as PushSubscription.toJSON() gives it. */
export interface Subscription { endpoint: string; keys: { p256dh: string; auth: string } }
/** What the service worker shows (web/public/sw.js); `tag` keeps one alert per thing. */
export interface Alert { title: string; body: string; url: string; tag: string }

export interface Pusher {
  /** The key browsers subscribe with. */
  publicKey: string;
  /** Throws an error with `statusCode` when the push service turns it down (404 or 410: gone). */
  send(sub: Subscription, alert: Alert): Promise<void>;
}

/** VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (hosted), or a key file made the first time (your own machine). */
export function loadVapid(env: { publicKey?: string; privateKey?: string }, file: string) {
  if (env.publicKey && env.privateKey) return { publicKey: env.publicKey, privateKey: env.privateKey };
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
  }
  return JSON.parse(readFileSync(file, 'utf8')) as { publicKey: string; privateKey: string };
}

/** `subject`: an https URL or mailto: the push services can reach the sender at. */
export function webPusher(keys: { publicKey: string; privateKey: string }, subject: string): Pusher {
  const vapidDetails = { subject, ...keys };
  return {
    publicKey: keys.publicKey,
    async send(sub, alert) {
      // A reminder is stale after a day; push services drop it rather than deliver it late.
      await webpush.sendNotification(sub, JSON.stringify(alert), { vapidDetails, TTL: 86_400, urgency: 'high' });
    },
  };
}

interface DeviceRow { id: string; endpoint: string; subscription: string; member_id: string | null; time_zone: string; created_at: string }

const realZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * Sends `alert` to each device that hasn't had `key` yet, and notes it. Devices the push service says
 * are gone are forgotten.
 */
export async function sendOnce(db: DB, pusher: Pusher, devices: DeviceRow[], key: string, alert: Alert, log?: FastifyInstance['log']) {
  for (const d of devices) {
    if (db.prepare('SELECT 1 FROM push_sent WHERE device_id = ? AND key = ?').get(d.id, key)) continue;
    try {
      await pusher.send(JSON.parse(d.subscription) as Subscription, alert);
      db.prepare('INSERT OR IGNORE INTO push_sent (device_id, key) VALUES (?, ?)').run(d.id, key);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) db.prepare('DELETE FROM push_devices WHERE id = ?').run(d.id);
      // Anything else is tried again next minute.
      else log?.warn({ err, status }, 'An alert could not be sent');
    }
  }
}

export function registerPush(app: FastifyInstance, db: DB, pusher?: Pusher) {
  app.get('/api/push/key', async (_req, reply) =>
    pusher ? { publicKey: pusher.publicKey } : reply.code(404).send({ error: 'Alerts are off on this server' }));

  // Turn alerts on for this device (again is fine: it keeps the newest owner and time zone).
  app.post<{ Body: { subscription: Subscription; timeZone: string } }>('/api/push', {
    schema: { body: { type: 'object', required: ['subscription', 'timeZone'], additionalProperties: false, properties: {
      subscription: { type: 'object', required: ['endpoint', 'keys'], properties: {
        endpoint: { type: 'string', pattern: '^https://', maxLength: 1000 },
        keys: { type: 'object', required: ['p256dh', 'auth'], properties: {
          p256dh: { type: 'string', maxLength: 200 }, auth: { type: 'string', maxLength: 100 } } },
      } },
      timeZone: { type: 'string', maxLength: 64 },
    } } },
  }, async (req, reply) => {
    const viewer = req.raw.viewer;
    if (viewer && viewer.role !== 'guardian') return reply.code(403).send({ error: 'Alerts are for grown-ups' });
    if (!pusher) return reply.code(404).send({ error: 'Alerts are off on this server' });
    const { subscription: { endpoint, keys }, timeZone } = req.body;
    if (!realZone(timeZone)) return reply.code(400).send({ error: 'Unknown time zone' });
    db.prepare(`INSERT INTO push_devices (id, endpoint, subscription, member_id, time_zone) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET subscription = excluded.subscription, member_id = excluded.member_id, time_zone = excluded.time_zone`)
      .run(randomUUID(), endpoint, JSON.stringify({ endpoint, keys }), viewer?.memberId ?? null, timeZone);
    return reply.code(204).send();
  });

  app.delete<{ Body: { endpoint: string } }>('/api/push', {
    schema: { body: { type: 'object', required: ['endpoint'], properties: { endpoint: { type: 'string', maxLength: 1000 } } } },
  }, async (req, reply) => {
    db.prepare('DELETE FROM push_devices WHERE endpoint = ?').run(req.body.endpoint);
    return reply.code(204).send();
  });
}
