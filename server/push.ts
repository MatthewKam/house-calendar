import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import webpush from 'web-push';
import type { DB } from './db.ts';
import { kidIds } from './privacy.ts';

// Alerts on people's phones (web push): reminders on Sprig's lists as they come due, and time to
// leave. A grown-up turns them on per device; the browser gives a subscription, kept here with whose
// device it is and its time zone. Kid and wall devices don't get them. Sending is replaced in tests.

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

/** The instant it's `hour`:`minute` on `day` (YYYY-MM-DD) in time zone `tz`. */
export function atLocal(day: string, hour: number, tz: string, minute = 0) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // How far the zone's clock is from UTC near then (worked out twice, for a day the clocks change).
  const offset = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(t).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

/** A reminder with a day but no time comes due at this hour, on each phone's own clock. */
export const DAY_HOUR = 8;
/** One that came due longer ago than this isn't sent (the server was off, or it was set late). */
const STALE = 12 * 3_600_000;

/** Who gets an alert about something for `memberIds`: those grown-ups, or every one when it's for anyone or a kid. */
function devicesFor(db: DB, memberIds: string[]) {
  const all = db.prepare('SELECT * FROM push_devices').all() as DeviceRow[];
  const kids = kidIds(db);
  if (memberIds.length === 0 || memberIds.some((id) => kids.has(id))) return all;
  return all.filter((d) => d.member_id && memberIds.includes(d.member_id));
}

/** When a reminder comes due on this device. */
const dueAt = (due: string, d: DeviceRow) => (due.length === 10 ? atLocal(due, DAY_HOUR, d.time_zone) : Date.parse(due));

/** A time to leave is sent only this soon after it comes up (the wall shows it until the event). */
const LEAVE_STALE = 30 * 60_000;

/** Sends what has come due: reminders on Sprig's lists, and time to leave. Run every minute. */
export async function sendDue(db: DB, pusher: Pusher, now = new Date(), log?: FastifyInstance['log']) {
  const t = now.getTime();
  // Noted sends are kept a month (long after anything could come due again).
  db.prepare('DELETE FROM push_sent WHERE sent_at < ?').run(new Date(t - 30 * 86_400_000).toISOString());

  const items = db.prepare(`SELECT i.id, i.title, i.due, i.member_id, l.title AS list, m.name
    FROM list_items i JOIN lists l ON l.id = i.list_id LEFT JOIN members m ON m.id = i.member_id
    WHERE i.done = 0 AND i.due IS NOT NULL`).all() as { id: string; title: string; due: string; member_id: string | null; list: string; name: string | null }[];
  for (const it of items) {
    const ready = devicesFor(db, it.member_id ? [it.member_id] : []).filter((d) => {
      const at = dueAt(it.due, d);
      return at <= t && t - at < STALE && at >= Date.parse(d.created_at);
    });
    if (!ready.length) continue;
    // The when is in the key, so moving it sends it again.
    await sendOnce(db, pusher, ready, `item:${it.id}:${it.due}`, {
      title: `⏰ ${it.title}`, body: it.name ? `${it.list} · ${it.name}` : it.list, url: '/#lists', tag: `item:${it.id}`,
    }, log);
  }
  // Time to leave (travel.ts), to the phones of who the event is for.
  const leaving = db.prepare(`SELECT a.id, a.event_id, a.title, a.destination, a.drive_minutes, a.leave_at, a.remind_at,
      (SELECT json_group_array(member_id) FROM event_members WHERE event_id = a.event_id) AS member_ids
    FROM leave_alerts a WHERE a.dismissed_at IS NULL AND a.remind_at <= ? AND a.remind_at > ? AND a.arrive_by > ?`)
    .all(now.toISOString(), new Date(t - LEAVE_STALE).toISOString(), now.toISOString()) as
    { id: string; title: string; destination: string; drive_minutes: number; leave_at: string; remind_at: string; member_ids: string }[];
  for (const a of leaving) {
    for (const d of devicesFor(db, JSON.parse(a.member_ids) as string[])) {
      if (Date.parse(a.remind_at) < Date.parse(d.created_at)) continue;
      // The leave time on each phone's own clock.
      const by = new Intl.DateTimeFormat('en-US', { timeZone: d.time_zone, hour: 'numeric', minute: '2-digit' }).format(new Date(a.leave_at));
      await sendOnce(db, pusher, [d], `leave:${a.id}`, {
        title: `🚗 Time to leave for ${a.title}`, body: `Leave by ${by} · ${a.drive_minutes} min to ${a.destination}`,
        url: '/#today', tag: `leave:${a.id}`,
      }, log);
    }
  }
}

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
  if (pusher) {
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      sendDue(db, pusher, new Date(), app.log).catch((err) => app.log.error(err)).finally(() => { running = false; });
    }, 60_000);
    timer.unref();
    app.addHook('onClose', async () => clearInterval(timer));
  }

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
