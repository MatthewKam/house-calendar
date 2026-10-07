import { createHash, randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import type { CalendarWriter } from './providers/types.ts';
import { currentDetails, deleteOccurrence, editEvent, newEvent, type Details } from './providers/icalEdit.ts';

// Edits to iCloud events made on the wall. Each is saved here and shown on the wall at once, then
// sent to iCloud after the Undo window, before each sync. If iCloud can't be reached the edit waits
// and is tried again. If the same details were changed on another device meanwhile, nothing is sent
// and the wall asks which version to keep.

/** Same remote occurrence, same local id, so React keys and an open editor survive a resync. */
export const eventId = (calendarId: string, remoteId: string) =>
  createHash('sha256').update(`${calendarId}\n${remoteId}`).digest('hex').slice(0, 32);

/** Changes aren't sent until the wall's 10-second Undo has passed. */
export const SEND_AFTER_MS = 12_000;

interface OutboxRow {
  id: number;
  calendar_id: string;
  remote_id: string;
  op: 'create' | 'update' | 'delete';
  changes: string;
  before: string;
  state: 'pending' | 'conflict';
  theirs: string | null;
  error: string | null;
  attempts: number;
  send_after: string;
}

/** The parts of a synced event row the wall can change. */
export interface SyncedRow {
  id: string;
  calendar_id: string;
  remote_id: string | null;
  title: string;
  all_day: number;
  start: string;
  end: string;
  location: string | null;
}

const detailsOf = (r: SyncedRow): Details =>
  ({ title: r.title, allDay: r.all_day === 1, start: r.start, end: r.end, location: r.location });

/** Equal as the wall shows them: instants compared as times, so "…00Z" and "….000Z" match. */
function same(key: keyof Details, a: Details, b: Details) {
  if ((key === 'start' || key === 'end') && !a.allDay && !b.allDay) return Date.parse(a[key]) === Date.parse(b[key]);
  return (a[key] ?? null) === (b[key] ?? null);
}

/** What differs between two versions; times move together (all day, start and end). */
export function diff(from: Details, to: Details): Partial<Details> {
  const out: Partial<Details> = {};
  if (to.title !== from.title) out.title = to.title;
  if (to.allDay !== from.allDay || !same('start', from, to) || !same('end', from, to)) {
    Object.assign(out, { allDay: to.allDay, start: to.start, end: to.end });
  }
  if ((to.location ?? null) !== (from.location ?? null)) out.location = to.location ?? null;
  return out;
}

const find = (db: DB, calendarId: string, remoteId: string) =>
  db.prepare('SELECT * FROM event_outbox WHERE calendar_id = ? AND remote_id = ?').get(calendarId, remoteId) as OutboxRow | undefined;

/**
 * Adds a new event to an iCloud calendar: shown on the wall at once, created in iCloud after the
 * Undo window. Its id is the one the sync will give it, so it stays the same event after that.
 */
export function queueCreate(db: DB, calendar: { id: string; remote_id: string }, details: Details, now = new Date()) {
  const href = new URL(`${randomUUID().toUpperCase()}.ics`, calendar.remote_id).href;
  db.transaction(() => {
    db.prepare(`INSERT INTO event_outbox (calendar_id, remote_id, op, changes, before, send_after) VALUES (?, ?, 'create', ?, 'null', ?)`)
      .run(calendar.id, href, JSON.stringify(details), new Date(now.getTime() + SEND_AFTER_MS).toISOString());
    overlayOutbox(db);
  })();
  return eventId(calendar.id, href);
}

/**
 * Saves an edit to a synced event (changes, or a delete) and shows it on the wall right away.
 * A second edit before sending merges into the first, keeping how iCloud had it originally.
 */
export function queueEdit(db: DB, row: SyncedRow, op: 'update' | 'delete', changes: Partial<Details>, now = new Date()) {
  if (!row.remote_id) throw new Error('Not a synced event');
  const sendAfter = new Date(now.getTime() + SEND_AFTER_MS).toISOString();
  db.transaction(() => {
    const old = find(db, row.calendar_id, row.remote_id!);
    const merged = { ...(old ? JSON.parse(old.changes) : {}), ...changes };
    if (old) {
      // Changing a new event before it's sent just changes what will be created.
      const nextOp = old.op === 'create' && op === 'update' ? 'create' : op;
      db.prepare(`UPDATE event_outbox SET op = ?, changes = ?, state = 'pending', theirs = NULL, error = NULL, send_after = ? WHERE id = ?`)
        .run(nextOp, JSON.stringify(merged), sendAfter, old.id);
    } else {
      // The wall's copy is iCloud's version here: edits made here always go through this table.
      db.prepare(`INSERT INTO event_outbox (calendar_id, remote_id, op, changes, before, send_after) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(row.calendar_id, row.remote_id, op, JSON.stringify(merged), JSON.stringify(detailsOf(row)), sendAfter);
    }
    overlayOutbox(db);
  })();
}

/** Undo for a delete made on the wall: brings the event back if the delete hasn't been sent yet. */
export function cancelDelete(db: DB, row: SyncedRow): boolean {
  if (!row.remote_id) return false;
  const old = find(db, row.calendar_id, row.remote_id);
  if (!old || old.op !== 'delete') return false;
  db.transaction(() => {
    const created = JSON.parse(old.before) === null;
    const changed = Object.keys(JSON.parse(old.changes)).length > 0;
    // A new event goes back to being created; earlier changes to an existing one still stand.
    if (created || changed) db.prepare(`UPDATE event_outbox SET op = ? WHERE id = ?`).run(created ? 'create' : 'update', old.id);
    else db.prepare('DELETE FROM event_outbox WHERE id = ?').run(old.id);
    db.prepare(`UPDATE events SET sync_state = ? WHERE id = ?`)
      .run(created ? 'pending_create' : changed ? 'pending_update' : 'synced', row.id);
    overlayOutbox(db);
  })();
  return true;
}

/** Puts waiting edits on top of the synced copy (called after every sync replaces it). */
export function overlayOutbox(db: DB) {
  const rows = db.prepare('SELECT * FROM event_outbox').all() as OutboxRow[];
  const update = db.prepare(`UPDATE events SET title = COALESCE(@title, title), all_day = COALESCE(@allDay, all_day),
      start = COALESCE(@start, start), end = COALESCE(@end, end),
      location = CASE WHEN @hasLocation THEN @location ELSE location END, sync_state = @syncState
    WHERE calendar_id = @calendarId AND remote_id = @remoteId`);
  // A new event isn't in iCloud's snapshot yet, so it's added back after each sync.
  const insert = db.prepare(`INSERT INTO events (id, calendar_id, title, all_day, start, end, location, remote_id, series_id, sync_state)
    VALUES (@id, @calendarId, @title, @allDay, @start, @end, @location, @remoteId, @remoteId, 'pending_create')
    ON CONFLICT(id) DO NOTHING`);
  const remove = db.prepare(`UPDATE events SET sync_state = 'pending_delete' WHERE calendar_id = ? AND remote_id = ?`);
  for (const r of rows) {
    if (r.op === 'delete') {
      remove.run(r.calendar_id, r.remote_id);
      continue;
    }
    const c = JSON.parse(r.changes) as Partial<Details>;
    if (r.op === 'create') {
      insert.run({ id: eventId(r.calendar_id, r.remote_id), calendarId: r.calendar_id, remoteId: r.remote_id,
        title: c.title, allDay: c.allDay ? 1 : 0, start: c.start, end: c.end, location: c.location ?? null });
    }
    update.run({
      syncState: r.op === 'create' ? 'pending_create' : 'pending_update',
      title: c.title ?? null, allDay: c.allDay === undefined ? null : c.allDay ? 1 : 0, start: c.start ?? null, end: c.end ?? null,
      hasLocation: 'location' in c ? 1 : 0, location: c.location ?? null, calendarId: r.calendar_id, remoteId: r.remote_id,
    });
  }
}

/**
 * Sends waiting edits whose Undo window has passed. Each is checked against iCloud's current
 * version first: if the details being changed were changed there too, it becomes a conflict.
 */
export async function pushOutbox(db: DB, writer: CalendarWriter, now = new Date()) {
  const rows = db.prepare(`SELECT * FROM event_outbox WHERE state = 'pending' AND send_after <= ? ORDER BY id`)
    .all(now.toISOString()) as OutboxRow[];
  const done = db.prepare('DELETE FROM event_outbox WHERE id = ?');
  const result = { sent: 0, conflicts: 0, failed: 0 };
  for (const r of rows) {
    const href = r.remote_id.split('#')[0];
    try {
      // iCloud can change between reading and writing; then read it again (twice at most).
      let outcome: 'sent' | 'conflict' | 'retry' = 'retry';
      for (let tries = 0; tries < 2 && outcome === 'retry'; tries++) {
        if (r.op === 'create') {
          // False means it's there already (sent before, but the reply was lost): done either way.
          const uid = href.split('/').pop()!.replace(/\.ics$/, '');
          await writer.writeEvent(href, '', newEvent(uid, JSON.parse(r.changes) as Details));
          outcome = 'sent';
          continue;
        }
        const res = await writer.getEvent(href);
        const theirs = res ? currentDetails(res.data, href, r.remote_id) : null;
        if (r.op === 'delete') {
          // Already gone there: nothing to do.
          if (!res || !theirs) outcome = 'sent';
          else if (await writer.writeEvent(href, res.etag, deleteOccurrence(res.data, href, r.remote_id))) outcome = 'sent';
          continue;
        }
        const changes = JSON.parse(r.changes) as Partial<Details>;
        const before = JSON.parse(r.before) as Details;
        const changedThere = !theirs || (Object.keys(changes) as (keyof Details)[]).some((k) => !same(k, theirs, before));
        if (changedThere) {
          db.prepare(`UPDATE event_outbox SET state = 'conflict', theirs = ?, error = NULL WHERE id = ?`)
            .run(theirs ? JSON.stringify(theirs) : null, r.id);
          outcome = 'conflict';
        } else if (await writer.writeEvent(href, res!.etag, editEvent(res!.data, href, r.remote_id, changes))) {
          outcome = 'sent';
        }
      }
      if (outcome === 'sent') {
        done.run(r.id);
        result.sent++;
      } else if (outcome === 'conflict') {
        result.conflicts++;
      } else {
        throw new Error('It kept changing in iCloud while saving');
      }
    } catch (err) {
      db.prepare('UPDATE event_outbox SET attempts = attempts + 1, error = ? WHERE id = ?')
        .run(err instanceof Error ? err.message : String(err), r.id);
      result.failed++;
    }
  }
  return result;
}

/** Edits waiting to be sent, and conflicts waiting for a choice, for the wall's notices. */
export function outboxStatus(db: DB) {
  const rows = db.prepare('SELECT * FROM event_outbox ORDER BY id').all() as OutboxRow[];
  const pending = rows.filter((r) => r.state === 'pending');
  return {
    pending: pending.length,
    // The newest problem sending, if edits are stuck (offline, or iCloud refusing).
    lastError: pending.filter((r) => r.error).at(-1)?.error ?? null,
    conflicts: rows.filter((r) => r.state === 'conflict').map((r) => {
      const before = JSON.parse(r.before) as Details;
      const changes = JSON.parse(r.changes) as Partial<Details>;
      return {
        id: r.id,
        // Only these are sent if the wall's version is kept; the rest stays as iCloud has it.
        changed: Object.keys(changes),
        mine: { ...before, ...changes },
        theirs: r.theirs ? (JSON.parse(r.theirs) as Details) : null,
      };
    }),
  };
}

/**
 * Settles a conflict. "mine" sends the wall's version over iCloud's (or, if it was deleted there,
 * lets it go); "theirs" drops the wall's edit and shows iCloud's version again.
 */
export function resolveConflict(db: DB, id: number, keep: 'mine' | 'theirs', now = new Date()): boolean {
  const r = db.prepare(`SELECT * FROM event_outbox WHERE id = ? AND state = 'conflict'`).get(id) as OutboxRow | undefined;
  if (!r) return false;
  db.transaction(() => {
    if (keep === 'mine' && r.theirs) {
      // Their version becomes the starting point, so the next send goes through.
      db.prepare(`UPDATE event_outbox SET state = 'pending', before = theirs, theirs = NULL, send_after = ? WHERE id = ?`)
        .run(now.toISOString(), id);
      return;
    }
    db.prepare('DELETE FROM event_outbox WHERE id = ?').run(id);
    if (!r.theirs) {
      db.prepare('DELETE FROM events WHERE calendar_id = ? AND remote_id = ?').run(r.calendar_id, r.remote_id);
    } else {
      const t = JSON.parse(r.theirs) as Details;
      db.prepare(`UPDATE events SET title = ?, all_day = ?, start = ?, end = ?, location = ?, sync_state = 'synced'
        WHERE calendar_id = ? AND remote_id = ?`).run(t.title, t.allDay ? 1 : 0, t.start, t.end, t.location, r.calendar_id, r.remote_id);
    }
  })();
  return true;
}
