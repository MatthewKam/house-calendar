import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { DB } from './db.ts';
import type { SyncStatus } from './sync.ts';
import { applyPeople, forgetMember } from './people.ts';
import { registerTasks } from './tasks.ts';
import { registerRewards } from './rewards.ts';
import { registerTravel, type Estimator } from './travel.ts';
import { registerWeather } from './weather.ts';
import { registerPhotos } from './photos.ts';
import { registerDaily } from './daily.ts';
import { registerAuth } from './auth.ts';
import { registerReminders } from './reminders.ts';
import { registerEvents } from './events.ts';

const COLOR = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } as const;

interface MemberRow { id: string; name: string; color: string; sort_order: number }
const toMember = (r: MemberRow) => ({ id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order });

export function buildApp(db: DB, opts: {
  webDist?: string;
  sync?: SyncStatus;
  /** Called after the family list or a calendar link changes, so Claude can sort what is now unassigned. */
  onAssignmentsChanged?: () => void;
  /** Shared secret the phones' Reminders Shortcut sends; without it, Reminders sync is off. */
  remindersToken?: string;
  /** Called after a list is changed on the wall, so the change can be sent to Reminders soon. */
  onRemindersChanged?: () => void;
  /** Drive-time lookups (Google Maps); without it, travel times are off. */
  travel?: Estimator;
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
} = {}) {
  // trustProxy: behind Tailscale's HTTPS (tailscale serve), so the device's address and https are seen.
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' && { level: 'info' }, trustProxy: 'loopback' });

  // The family PIN: once set, every /api call needs a signed-in device.
  registerAuth(app, db);

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

  app.patch<{ Params: { id: string }; Body: { name?: string; color?: string; sortOrder?: number } }>('/api/members/:id', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1,
      properties: { name: { type: 'string', minLength: 1, maxLength: 40 }, color: COLOR, sortOrder: { type: 'integer' } } } },
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id) as MemberRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Member not found' });
    const { name = row.name, color = row.color, sortOrder = row.sort_order } = req.body;
    db.prepare('UPDATE members SET name = ?, color = ?, sort_order = ? WHERE id = ?')
      .run(name.trim(), color.toLowerCase(), sortOrder, row.id);
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
  app.get('/api/sync', async () => opts.sync ?? null);

  registerTasks(app, db);
  registerRewards(app, db);
  registerTravel(app, db, opts.travel);
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
