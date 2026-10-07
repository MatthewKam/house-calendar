import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';

// Drive time from home to an event's location, and when to leave to arrive on time.

/** Drive time and distance when leaving at `departAt` (now, if that's in the past). */
export type Estimator = (origin: string, destination: string, departAt: Date) => Promise<{ seconds: number; meters: number }>;

export interface Trip {
  minutes: number;
  meters: number;
  /** When to leave to arrive at the event's start; null for all-day or already-started events. */
  leaveAt: string | null;
  /** The leave time has already passed. */
  late: boolean;
  origin: string;
  destination: string;
}

/**
 * Google Maps Routes API, with predicted traffic for the departure time. The key stays on the
 * server. https://developers.google.com/maps/documentation/routes/compute_route_directions
 */
export function googleRoutes(apiKey: string, fetchImpl: typeof fetch = fetch): Estimator {
  return async (origin, destination, departAt) => {
    const body: Record<string, unknown> = {
      origin: { address: origin },
      destination: { address: destination },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    };
    // Google only accepts a departure time in the future; without one it uses now.
    if (departAt.getTime() > Date.now() + 60_000) body.departureTime = departAt.toISOString();
    const res = await fetchImpl('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { routes?: { duration?: string; distanceMeters?: number }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message ?? `Google Maps answered ${res.status}`);
    const route = data.routes?.[0];
    if (!route?.duration) throw new Error("Google Maps couldn't find a driving route to that address");
    return { seconds: parseInt(route.duration, 10), meters: route.distanceMeters ?? 0 };
  };
}

/**
 * Works back from the arrival time: estimate leaving 30 minutes before, then again leaving at the
 * time that first answer implies, so the traffic matches when you'd actually be on the road.
 */
export async function planTrip(estimate: Estimator, origin: string, destination: string, arriveBy: Date | null, now = new Date()) {
  if (!arriveBy || arriveBy <= now) {
    const r = await estimate(origin, destination, now);
    return { minutes: Math.round(r.seconds / 60), meters: r.meters, leaveAt: null, late: false };
  }
  const first = await estimate(origin, destination, new Date(Math.max(now.getTime(), arriveBy.getTime() - 30 * 60_000)));
  const guess = new Date(arriveBy.getTime() - first.seconds * 1000);
  const final = guess > now ? await estimate(origin, destination, guess) : first;
  const leaveAt = new Date(arriveBy.getTime() - final.seconds * 1000);
  return { minutes: Math.round(final.seconds / 60), meters: final.meters, leaveAt: leaveAt.toISOString(), late: leaveAt <= now };
}

/** Results are reused for a few minutes, so tapping the button again doesn't cost more requests. */
const CACHE_MS = 10 * 60_000;

interface AlertRow {
  id: string; event_id: string; title: string; destination: string; arrive_by: string; minutes_before: number;
  drive_minutes: number; leave_at: string; remind_at: string; refreshed_at: string | null; dismissed_at: string | null;
}
const toAlert = (r: AlertRow) => ({
  id: r.id, eventId: r.event_id, title: r.title, destination: r.destination, arriveBy: r.arrive_by,
  minutesBefore: r.minutes_before, driveMinutes: r.drive_minutes, leaveAt: r.leave_at, remindAt: r.remind_at,
});

/** How long before leaving traffic is checked again (once). */
const REFRESH_BEFORE_MS = 30 * 60_000;

export function registerTravel(app: FastifyInstance, db: DB, estimate: Estimator | undefined) {
  const cache = new Map<string, { at: number; trip: Omit<Trip, 'late'> }>();
  const home = () => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'homeAddress'`).get() as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as string).trim() : '';
  };

  app.get<{ Params: { id: string } }>('/api/events/:id/travel', async (req, reply) => {
    if (!estimate) return reply.code(503).send({ error: 'Travel times need GOOGLE_MAPS_API_KEY in .env (see README)' });
    const ev = db.prepare('SELECT all_day, start, location FROM events WHERE id = ?').get(req.params.id) as
      { all_day: number; start: string; location: string | null } | undefined;
    if (!ev) return reply.code(404).send({ error: 'Event not found' });
    if (!ev.location) return reply.code(400).send({ error: 'This event has no address' });
    const origin = home();
    if (!origin) return reply.code(400).send({ error: 'Set your home address in Settings first' });

    const arriveBy = ev.all_day ? null : new Date(ev.start);
    const key = `${origin}\n${ev.location}\n${arriveBy?.toISOString() ?? 'now'}`;
    const hit = cache.get(key);
    let trip = hit && Date.now() - hit.at < CACHE_MS ? hit.trip : undefined;
    if (!trip) {
      try {
        const plan = await planTrip(estimate, origin, ev.location, arriveBy);
        trip = { minutes: plan.minutes, meters: plan.meters, leaveAt: plan.leaveAt, origin, destination: ev.location };
        cache.set(key, { at: Date.now(), trip });
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : 'Travel time lookup failed' });
      }
    }
    return { ...trip, late: !!trip.leaveAt && Date.parse(trip.leaveAt) <= Date.now() } satisfies Trip;
  });

  // ---- "Time to leave" alerts on the wall ------------------------------------------
  // Active alerts (not dismissed, and not for an event that started over an hour ago).
  app.get('/api/alerts', async () =>
    (db.prepare(`SELECT * FROM leave_alerts WHERE dismissed_at IS NULL AND arrive_by > ? ORDER BY remind_at`)
      .all(new Date(Date.now() - 3_600_000).toISOString()) as AlertRow[]).map(toAlert));

  app.post<{ Body: { eventId: string; minutesBefore: number } }>('/api/alerts', {
    schema: { body: { type: 'object', required: ['eventId', 'minutesBefore'], additionalProperties: false,
      properties: { eventId: { type: 'string' }, minutesBefore: { type: 'integer', minimum: 0, maximum: 120 } } } },
  }, async (req, reply) => {
    if (!estimate) return reply.code(503).send({ error: 'Travel times need GOOGLE_MAPS_API_KEY in .env (see README)' });
    const ev = db.prepare('SELECT title, all_day, start, location FROM events WHERE id = ?').get(req.body.eventId) as
      { title: string; all_day: number; start: string; location: string | null } | undefined;
    if (!ev) return reply.code(404).send({ error: 'Event not found' });
    if (!ev.location || ev.all_day) return reply.code(400).send({ error: 'Alerts need a timed event with an address' });
    const origin = home();
    if (!origin) return reply.code(400).send({ error: 'Set your home address in Settings first' });
    let plan;
    try {
      plan = await planTrip(estimate, origin, ev.location, new Date(ev.start));
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Travel time lookup failed' });
    }
    if (!plan.leaveAt) return reply.code(400).send({ error: 'This event has already started' });
    const remindAt = new Date(Date.parse(plan.leaveAt) - req.body.minutesBefore * 60_000).toISOString();
    const id = randomUUID();
    db.transaction(() => {
      // One alert per event: setting a new one replaces the old.
      db.prepare('DELETE FROM leave_alerts WHERE event_id = ?').run(req.body.eventId);
      db.prepare(`INSERT INTO leave_alerts (id, event_id, title, destination, arrive_by, minutes_before, drive_minutes, leave_at, remind_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.body.eventId, ev.title, ev.location, ev.start, req.body.minutesBefore, plan.minutes, plan.leaveAt, remindAt);
    })();
    reply.code(201);
    return toAlert(db.prepare('SELECT * FROM leave_alerts WHERE id = ?').get(id) as AlertRow);
  });

  app.post<{ Params: { id: string } }>('/api/alerts/:id/dismiss', async (req, reply) => {
    db.prepare(`UPDATE leave_alerts SET dismissed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(req.params.id);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/alerts/:id', async (req, reply) => {
    db.prepare('DELETE FROM leave_alerts WHERE id = ?').run(req.params.id);
    return reply.code(204).send();
  });

  /** Re-checks traffic once for alerts whose leave time is within the next half hour. */
  async function refreshSoon(now = new Date()) {
    if (!estimate) return;
    const origin = home();
    if (!origin) return;
    const due = db.prepare(`SELECT * FROM leave_alerts WHERE dismissed_at IS NULL AND refreshed_at IS NULL
      AND leave_at > ? AND leave_at <= ?`).all(now.toISOString(), new Date(now.getTime() + REFRESH_BEFORE_MS).toISOString()) as AlertRow[];
    for (const a of due) {
      try {
        const plan = await planTrip(estimate, origin, a.destination, new Date(a.arrive_by), now);
        if (!plan.leaveAt) continue;
        db.prepare(`UPDATE leave_alerts SET drive_minutes = ?, leave_at = ?, remind_at = ?, refreshed_at = ? WHERE id = ?`)
          .run(plan.minutes, plan.leaveAt, new Date(Date.parse(plan.leaveAt) - a.minutes_before * 60_000).toISOString(),
            now.toISOString(), a.id);
      } catch (err) {
        app.log.warn({ err }, 'leave alert traffic re-check failed');
        db.prepare('UPDATE leave_alerts SET refreshed_at = ? WHERE id = ?').run(now.toISOString(), a.id);
      }
    }
  }
  const timer = setInterval(() => void refreshSoon(), 60_000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
  return { refreshSoon };
}
