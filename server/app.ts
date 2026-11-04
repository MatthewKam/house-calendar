import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { DB } from './db.ts';
import type { SyncStatus } from './sync.ts';
import type { Connection } from './connections.ts';
import { applyPeople, forgetMember } from './people.ts';
import { registerTasks } from './tasks.ts';
import { registerRewards } from './rewards.ts';
import { registerTravel, type Estimator } from './travel.ts';
import { registerPlaces, type PlaceSearch } from './places.ts';
import { registerWeather } from './weather.ts';
import { registerPhotos } from './photos.ts';
import { registerDaily } from './daily.ts';
import { registerGuard } from './auth.ts';
import { registerReminders } from './reminders.ts';
import { registerEvents } from './events.ts';
import { localDay, stageOf, STAGES } from './stages.ts';

const COLOR = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } as const;

interface MemberRow { id: string; name: string; color: string; sort_order: number; birthdate: string | null; stage: string | null }
const toMember = (r: MemberRow) => ({
  id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order, birthdate: r.birthdate,
  // The stage in effect, and the one a guardian chose (null: from the birthdate).
  stage: stageOf(r, localDay()), stageChosen: r.stage,
});
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;

export function buildApp(db: DB, opts: {
  webDist?: string;
  /** Calendar sync status: one, or worked out on each call when accounts come and go. */
  sync?: SyncStatus | (() => SyncStatus | null);
  /** People's Google Calendar connections; without it, Google Calendar is off. */
  google?: { list(): Connection[]; remove(id: string): Promise<boolean> };
  /** People's iCloud connections, made here with an Apple ID and app-specific password. */
  icloud?: {
    list(): Connection[]; remove(id: string): Promise<boolean>;
    /** Throws ICloudLoginError when iCloud doesn't accept them. */
    connect(c: { memberId: string | null; appleId: string; password: string }): Promise<void>;
  };
  /** Called after the family list or a calendar link changes, so Claude can sort what is now unassigned. */
  onAssignmentsChanged?: () => void;
  /** Shared secret the phones' Reminders Shortcut sends; without it, Reminders sync is off. */
  remindersToken?: string;
  /** Called after a list is changed on the wall, so the change can be sent to Reminders soon. */
  onRemindersChanged?: () => void;
  /** Drive-time lookups (Google Maps); without it, travel times are off. */
  travel?: Estimator;
  /** Address suggestions while typing (Google Places); without it, the address is plain text. */
  places?: PlaceSearch;
  /**
   * Edits to synced events: present when they can be sent to iCloud; soon() sends a new edit after
   * the Undo window. Without it, synced events are read-only.
   */
  syncedEdits?: { soon: () => void };
  /** Where album photos are stored; without it, the album is off. */
  photosDir?: string;
  /** How the daily joke, quote and events are fetched (replaced in tests). */
  dailyFetch?: typeof fetch;
  /** How weather lookups reach the internet (replaced in tests). */
  weatherFetch?: typeof fetch;
  /** Called after a person is removed, so their sign-ins to this household go too. */
  onMemberRemoved?: (memberId: string) => void;
} = {}) {
  // trustProxy: behind Tailscale's HTTPS (tailscale serve), so the device's address and https are seen.
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' && { level: 'info' }, trustProxy: 'loopback' });

  // Parent-only changes need a guardian (or a device unlocked with a guardian's PIN).
  registerGuard(app);

  // ---- Members -----------------------------------------------------------
  app.get('/api/members', async () =>
    (db.prepare('SELECT * FROM members ORDER BY sort_order, created_at').all() as MemberRow[]).map(toMember));

  app.post<{ Body: { name: string; color: string } }>('/api/members', {
    schema: { body: { type: 'object', required: ['name', 'color'], additionalProperties: false,
      properties: { name: { type: 'string', minLength: 1, maxLength: 40 }, color: COLOR } } },
  }, async (req, reply) => {
    const id = randomUUID();
    const next = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM members').get() as { n: number }).n;
    db.prepare('INSERT INTO members (id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(id, req.body.name.trim(), req.body.color.toLowerCase(), next);
    opts.onAssignmentsChanged?.();
    reply.code(201);
    return toMember(db.prepare('SELECT * FROM members WHERE id = ?').get(id) as MemberRow);
  });

  app.patch<{ Params: { id: string }; Body: { name?: string; color?: string; sortOrder?: number; birthdate?: string | null; stage?: string | null } }>('/api/members/:id', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 40 }, color: COLOR, sortOrder: { type: 'integer' },
        birthdate: { anyOf: [DATE, { type: 'null' }] }, stage: { anyOf: [{ enum: STAGES }, { type: 'null' }] },
      } } },
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id) as MemberRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Member not found' });
    const { name = row.name, color = row.color, sortOrder = row.sort_order, birthdate = row.birthdate, stage = row.stage } = req.body;
    // A real day (not Feb 31), and not in the future.
    const realDay = (d: string) => {
      const t = Date.parse(`${d}T00:00:00Z`);
      return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
    };
    if (birthdate && (!realDay(birthdate) || birthdate > localDay())) {
      return reply.code(400).send({ error: 'That birthday is not a real past date' });
    }
    db.prepare('UPDATE members SET name = ?, color = ?, sort_order = ?, birthdate = ?, stage = ? WHERE id = ?')
      .run(name.trim(), color.toLowerCase(), sortOrder, birthdate, stage, row.id);
    if (name.trim() !== row.name) opts.onAssignmentsChanged?.();
    return toMember(db.prepare('SELECT * FROM members WHERE id = ?').get(row.id) as MemberRow);
  });

  // Events of a removed member stay on the calendar, for whoever else they're for (or everyone).
  app.delete<{ Params: { id: string } }>('/api/members/:id', async (req, reply) => {
    const res = db.transaction(() => {
      forgetMember(db, req.params.id);
      return db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
    })();
    if (res.changes === 0) return reply.code(404).send({ error: 'Member not found' });
    opts.onMemberRemoved?.(req.params.id);
    // Calendars linked to this person fall back to manual and Claude picks.
    applyPeople(db);
    opts.onAssignmentsChanged?.();
    return reply.code(204).send();
  });

  // ---- Events, and edits waiting for iCloud (events.ts) ------------------
  registerEvents(app, db, opts.syncedEdits);

  // ---- Synced calendars: who each is for, and whether it shows ------------
  interface CalendarRow { id: string; provider: string; name: string; color: string | null; member_id: string | null; hidden: number; writable: number }
  const calendarSummary = (c: CalendarRow) => ({
    id: c.id, provider: c.provider, name: c.name, color: c.color, memberId: c.member_id, hidden: c.hidden === 1,
    // New events can be added to it from the wall.
    writable: c.writable === 1 && !!opts.syncedEdits,
    events: (db.prepare('SELECT COUNT(DISTINCT series_id) n FROM events WHERE calendar_id = ?').get(c.id) as { n: number }).n,
    // A few upcoming titles, to tell same-named calendars apart.
    sample: (db.prepare(`SELECT title FROM events WHERE calendar_id = ? AND end >= ?
                         GROUP BY series_id ORDER BY MIN(start) LIMIT 3`).all(c.id, new Date().toISOString().slice(0, 10)) as
      { title: string }[]).map((r) => r.title),
  });

  app.get('/api/calendars', async () =>
    (db.prepare("SELECT * FROM calendars WHERE provider != 'local' ORDER BY name, id").all() as CalendarRow[]).map(calendarSummary));

  app.patch<{ Params: { id: string }; Body: { memberId?: string | null; hidden?: boolean } }>('/api/calendars/:id', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1,
      properties: { memberId: { type: ['string', 'null'] }, hidden: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const row = db.prepare("SELECT * FROM calendars WHERE id = ? AND provider != 'local'").get(req.params.id) as CalendarRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Calendar not found' });
    const { memberId = row.member_id, hidden = row.hidden === 1 } = req.body;
    if (memberId && !db.prepare('SELECT 1 FROM members WHERE id = ?').get(memberId)) {
      return reply.code(400).send({ error: 'Unknown member' });
    }
    db.transaction(() => {
      db.prepare('UPDATE calendars SET member_id = ?, hidden = ? WHERE id = ?').run(memberId, hidden ? 1 : 0, row.id);
      applyPeople(db, row.id);
    })();
    // Unlinking or showing a calendar can leave events for Claude to sort.
    opts.onAssignmentsChanged?.();
    return calendarSummary(db.prepare('SELECT * FROM calendars WHERE id = ?').get(row.id) as CalendarRow);
  });

  // ---- Calendar sync status (null when no account is set up) --------------
  app.get('/api/sync', async () => (typeof opts.sync === 'function' ? opts.sync() : opts.sync) ?? null);

  // ---- Calendar connections: Google (connecting is on the front server: /api/account/google/connect)
  // and iCloud (connected here).
  app.get('/api/connections', async () => ({
    google: opts.google ? opts.google.list() : null,
    icloud: opts.icloud ? opts.icloud.list() : null,
  }));

  // The person connecting is whoever is signed in; a wall unlocked by a parent connects it for no one.
  app.post<{ Body: { appleId: string; password: string } }>('/api/connections/icloud', {
    schema: {
      body: {
        type: 'object', required: ['appleId', 'password'], additionalProperties: false,
        properties: { appleId: { type: 'string', minLength: 3, maxLength: 200 }, password: { type: 'string', minLength: 1, maxLength: 100 } },
      },
    },
  }, async (req, reply) => {
    if (!opts.icloud) return reply.code(404).send({ error: 'Not found' });
    try {
      await opts.icloud.connect({ memberId: req.raw.viewer?.memberId ?? null, appleId: req.body.appleId, password: req.body.password });
    } catch (err) {
      if (err instanceof Error && err.name === 'ICloudLoginError') return reply.code(400).send({ error: err.message });
      req.log.error({ err }, 'connecting iCloud failed');
      return reply.code(502).send({ error: "Couldn't reach iCloud. Try again in a minute." });
    }
    return reply.code(204).send();
  });

  // Removing a connection: the person who connected it, or a parent.
  app.delete<{ Params: { id: string } }>('/api/connections/:id', async (req, reply) => {
    const kind = [opts.google, opts.icloud].find((k) => k?.list().some((c) => c.id === req.params.id));
    const row = kind?.list().find((c) => c.id === req.params.id);
    if (!kind || !row) return reply.code(404).send({ error: 'Not found' });
    const viewer = req.raw.viewer;
    if (viewer && !viewer.parent && viewer.memberId !== row.memberId) {
      return reply.code(403).send({ error: "Locked: unlock with a guardian's PIN to change this", locked: true });
    }
    await kind.remove(row.id);
    return reply.code(204).send();
  });

  registerTasks(app, db);
  registerRewards(app, db);
  registerTravel(app, db, opts.travel);
  registerPlaces(app, db, opts.places);
  registerWeather(app, db, opts.weatherFetch);
  registerDaily(app, db, opts.dailyFetch);
  if (opts.photosDir) registerPhotos(app, db, opts.photosDir);
  registerReminders(app, db, opts.remindersToken, opts.onRemindersChanged);

  // ---- Display settings (key/value, for things like UI scale) -------------
  app.get('/api/settings', async () => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  });

  app.put<{ Params: { key: string }; Body: { value: unknown } }>('/api/settings/:key', {
    schema: { params: { type: 'object', properties: { key: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_.]{0,63}$' } } },
      body: { type: 'object', required: ['value'], properties: { value: {} } } },
  }, async (req) => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(req.params.key, JSON.stringify(req.body.value));
    return { [req.params.key]: req.body.value };
  });

  // ---- Built UI (production) ---------------------------------------------
  if (opts.webDist && existsSync(opts.webDist)) {
    app.register(fastifyStatic, { root: opts.webDist });
  }

  return app;
}
