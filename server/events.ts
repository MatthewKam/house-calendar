import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { DAY_VALUE, isDay, allMembersExist } from './schemas.ts';
import { assignManually } from './people.ts';
import { cancelDelete, diff, outboxStatus, queueCreate, queueEdit, queueSeries, resolveConflict } from './outbox.ts';
import type { Viewer } from './auth.ts';
import { accessFor, eventAccess, kidIds, setVisibility, VISIBILITIES, VISIBILITY_SQL, type Access, type Visibility } from './privacy.ts';

// Events on the wall: its own, and synced ones (iCloud), whose edits go through the outbox
// (outbox.ts) and are sent to iCloud shortly after.


interface EventRow {
  id: string; calendar_id: string; title: string; remote_id: string | null; series_id: string | null;
  all_day: number; start: string; end: string; sync_state: string; location: string | null;
  notes: string | null; photo_id: string | null;
  /** JSON array of member ids, in family order; [] means everyone. */
  member_ids: string;
  /** Who sees it (privacy.ts): its own setting, else its calendar's. */
  visibility: Visibility;
  /** Marked special: a countdown on kid mode's Today. */
  special: number;
  /** Its flyer: photo_id, or a synced event's from event_flyers. */
  flyer_id: string | null;
}

/** Keeps a synced event's flyer (every repeat of it), or lets it go (null). */
function setFlyer(db: DB, eventId: string, photoId: string | null) {
  const ev = seriesOf(db, eventId);
  if (!ev) return;
  if (photoId) {
    db.prepare(`INSERT INTO event_flyers (calendar_id, series_key, photo_id) VALUES (?, ?, ?)
      ON CONFLICT (calendar_id, series_key) DO UPDATE SET photo_id = excluded.photo_id`).run(ev.calendar_id, ev.key, photoId);
  } else db.prepare('DELETE FROM event_flyers WHERE calendar_id = ? AND series_key = ?').run(ev.calendar_id, ev.key);
}

// Event columns plus who it's for, from event_members, who sees it, whether it's special, and its
// flyer (a synced event's is kept in event_flyers).
const SERIES_OF = 's.calendar_id = e.calendar_id AND s.series_key = COALESCE(e.series_id, e.id)';
const EVENT_SELECT = `
  SELECT e.*, COALESCE(e.photo_id, (SELECT s.photo_id FROM event_flyers s WHERE ${SERIES_OF})) AS flyer_id,
    (SELECT json_group_array(member_id) FROM (
    SELECT em.member_id FROM event_members em JOIN members m ON m.id = em.member_id
    WHERE em.event_id = e.id ORDER BY m.sort_order, m.created_at)) AS member_ids,
    ${VISIBILITY_SQL} AS visibility,
    EXISTS (SELECT 1 FROM event_special s WHERE ${SERIES_OF}) AS special
  FROM events e`;

/** An event's calendar and series (every repeat of it), which its special mark and flyer are kept by. */
const seriesOf = (db: DB, eventId: string) =>
  db.prepare('SELECT calendar_id, COALESCE(series_id, id) AS key FROM events WHERE id = ?').get(eventId) as
    { calendar_id: string; key: string } | undefined;

/** Marks an event (every repeat of it) special, or not. */
function setSpecial(db: DB, eventId: string, special: boolean) {
  const ev = seriesOf(db, eventId);
  if (!ev) return false;
  if (special) db.prepare('INSERT OR IGNORE INTO event_special (calendar_id, series_key) VALUES (?, ?)').run(ev.calendar_id, ev.key);
  else db.prepare('DELETE FROM event_special WHERE calendar_id = ? AND series_key = ?').run(ev.calendar_id, ev.key);
  return true;
}

const toEvent = (r: EventRow) => ({
  id: r.id, calendarId: r.calendar_id, memberIds: JSON.parse(r.member_ids) as string[], title: r.title,
  allDay: r.all_day === 1, start: r.start, end: r.end, syncState: r.sync_state, location: r.location,
  // One day of a repeating iCloud event; edits here change that day only.
  repeats: !!r.remote_id?.includes('#'),
  visibility: r.visibility,
  special: !!r.special,
  // Its notes (an iCloud event's are its own, synced both ways), and the flyer it was read from.
  notes: r.notes,
  photoUrl: r.flyer_id && `/api/photos/${r.flyer_id}/full`,
});
/** A Busy event someone else is on: just the time and who, never its title or place. */
const asBusy = (r: EventRow) => ({ ...toEvent(r), title: 'Busy', location: null, notes: null, photoUrl: null, busy: true });

/** A title as copies are matched by: ignoring case and spacing. */
const titleKey = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The same event often sits in two calendars (a shared family calendar and a personal one), so
 * show it once: same title (ignoring case and spacing) and same start and end. Of the copies, keep
 * one that says who it's for, then one added on the wall (those can be edited here).
 */
function dedupe(rows: EventRow[], access?: Map<EventRow, Access>): EventRow[] {
  // A copy the viewer sees in full beats one they only see as Busy.
  const rank = (r: EventRow) => (access?.get(r) === 'busy' ? 4 : 0) + (r.member_ids !== '[]' ? 0 : 2) + (r.calendar_id === 'local' ? 0 : 1);
  const best = new Map<string, EventRow>();
  for (const r of rows) {
    const key = [titleKey(r.title), r.all_day, r.start, r.end].join('\n');
    const kept = best.get(key);
    if (!kept || rank(r) < rank(kept)) best.set(key, r);
  }
  // Keep the query's order.
  const keep = new Set(best.values());
  return rows.filter((r) => keep.has(r));
}

/** memberIds: who it's for; empty means everyone. */
interface EventInput {
  title: string; memberIds: string[]; allDay: boolean; start: string; end: string; location?: string | null;
  /** Notes go to iCloud with a synced event; the flyer's photo stays here (iCloud has nowhere for it). */
  notes?: string | null; photoId?: string | null;
}

function validateTimes(ev: EventInput): string | null {
  if (ev.allDay) {
    if (!isDay(ev.start) || !isDay(ev.end)) return 'All-day events use YYYY-MM-DD dates';
    return ev.end > ev.start ? null : 'End must be after start';
  }
  const start = Date.parse(ev.start);
  const end = Date.parse(ev.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Timed events need ISO date-times';
  return end > start ? null : 'End must be after start';
}

// Synced events can be changed here only when the calendar service takes edits (iCloud does).
const READ_ONLY = "This event comes from iCloud. Change it on your iPhone or Mac.";
const GOOGLE_READ_ONLY = 'This event comes from Google Calendar. Change it there.';

/**
 * Event routes. `syncedEdits` is present when changes to synced events can be sent to iCloud (soon()
 * sends a new edit after the Undo window); without it, synced events are read-only.
 */
export function registerEvents(app: FastifyInstance, db: DB, syncedEdits?: { soon: () => void }) {
  // ---- Events ------------------------------------------------------------
  const getEvent = (id: string) => toEvent(db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(id) as EventRow);
  const knownPhoto = (id?: string | null) => !id || !!db.prepare('SELECT 1 FROM photos WHERE id = ?').get(id);
  /** Replaces who a wall event is for. */
  function setMembers(eventId: string, memberIds: string[]) {
    db.prepare('DELETE FROM event_members WHERE event_id = ?').run(eventId);
    const add = db.prepare('INSERT OR IGNORE INTO event_members (event_id, member_id) VALUES (?, ?)');
    for (const m of memberIds) add.run(eventId, m);
  }

  const eventBody = {
    type: 'object', additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      memberIds: { type: 'array', maxItems: 20, items: { type: 'string' } },
      location: { type: ['string', 'null'], maxLength: 300 },
      notes: { type: ['string', 'null'], maxLength: 4000 },
      photoId: { type: ['string', 'null'] },
      allDay: { type: 'boolean' },
      start: { type: 'string' },
      end: { type: 'string' },
    },
  } as const;

  // Returns events overlapping [from, to). from/to are YYYY-MM-DD in the display's local zone,
  // passed with their UTC instants so timed and all-day events can both be compared.
  app.get<{ Querystring: { from: string; to: string; fromDay: string; toDay: string } }>('/api/events', {
    schema: { querystring: { type: 'object', required: ['from', 'to', 'fromDay', 'toDay'],
      properties: { from: { type: 'string' }, to: { type: 'string' },
        fromDay: DAY_VALUE, toDay: DAY_VALUE } } },
  }, async (req) => {
    const { from, to, fromDay, toDay } = req.query;
    const rows = db.prepare(`${EVENT_SELECT}
      WHERE e.sync_state != 'pending_delete'
        AND e.calendar_id NOT IN (SELECT id FROM calendars WHERE hidden = 1)
        AND ((e.all_day = 0 AND e.start < @to AND e.end > @from)
          OR (e.all_day = 1 AND e.start < @toDay AND e.end > @fromDay))
      ORDER BY e.all_day DESC, e.start`).all({ from, to, fromDay, toDay }) as EventRow[];
    // Only what this viewer may see: Busy ones as just their time, and none they can't.
    const kids = kidIds(db);
    const access = new Map(rows.map((r) => [r, accessFor(req.raw.viewer, kids, r.visibility, JSON.parse(r.member_ids))]));
    return dedupe(rows.filter((r) => access.get(r) !== 'none'), access)
      .map((r) => (access.get(r) === 'busy' ? asBusy(r) : toEvent(r)));
  });

  // calendarId: an iCloud calendar to add it to (sent there shortly); left out, it stays on the wall.
  // visibility: who sees it, when not its calendar's default. special: a countdown on kid mode's Today.
  app.post<{ Body: EventInput & { calendarId?: string; visibility?: Visibility; special?: boolean } }>('/api/events', {
    schema: { body: { ...eventBody, properties: { ...eventBody.properties, calendarId: { type: 'string' }, visibility: { enum: VISIBILITIES },
      special: { type: 'boolean' } },
      required: ['title', 'allDay', 'start', 'end'] } },
  }, async (req, reply) => {
    const ev = { ...req.body, memberIds: req.body.memberIds ?? [] };
    const err = validateTimes(ev);
    if (err) return reply.code(400).send({ error: err });
    if (!allMembersExist(db, ev.memberIds)) return reply.code(400).send({ error: 'Unknown member' });
    if (!knownPhoto(ev.photoId)) return reply.code(400).send({ error: 'Unknown photo' });
    if (req.body.calendarId && req.body.calendarId !== 'local') {
      const cal = db.prepare(`SELECT id, remote_id, writable FROM calendars WHERE id = ? AND provider != 'local'`)
        .get(req.body.calendarId) as { id: string; remote_id: string; writable: number } | undefined;
      if (!cal) return reply.code(400).send({ error: 'Unknown calendar' });
      if (!syncedEdits || !cal.writable) return reply.code(409).send({ error: "That calendar can't be added to from here" });
      const id = queueCreate(db, cal, { title: ev.title.trim(), allDay: ev.allDay, start: ev.start, end: ev.end,
        location: ev.location?.trim() || null, notes: ev.notes?.trim() || null });
      // Who it's for, who sees it, special and the flyer are kept on this display, like any iCloud event's.
      if (ev.memberIds.length) assignManually(db, id, ev.memberIds);
      if (req.body.visibility) setVisibility(db, id, req.body.visibility);
      if (req.body.special) setSpecial(db, id, true);
      if (ev.photoId) setFlyer(db, id, ev.photoId);
      syncedEdits.soon();
      reply.code(201);
      return getEvent(id);
    }
    const id = randomUUID();
    db.transaction(() => {
      db.prepare(`INSERT INTO events (id, calendar_id, title, all_day, start, end, location, notes, photo_id) VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, ev.title.trim(), ev.allDay ? 1 : 0, ev.start, ev.end, ev.location?.trim() || null, ev.notes?.trim() || null, ev.photoId ?? null);
      setMembers(id, ev.memberIds);
      if (req.body.visibility) setVisibility(db, id, req.body.visibility);
      if (req.body.special) setSpecial(db, id, true);
    })();
    reply.code(201);
    return getEvent(id);
  });

  /**
   * Other copies of the same event (same title, same times) in other calendars: the wall shows one,
   * so a change made to it is made to all of them. `deleted`: the copies waiting to be deleted with it
   * (for Undo), instead of the ones still showing.
   */
  function copiesOf(row: EventRow, deleted = false) {
    return (db.prepare(`SELECT * FROM events WHERE id != ? AND all_day = ? AND start = ? AND end = ?
      AND (sync_state = 'pending_delete') = ?`).all(row.id, row.all_day, row.start, row.end, deleted ? 1 : 0) as EventRow[])
      .filter((r) => titleKey(r.title) === titleKey(row.title));
  }
  /** Google events are changed in Google Calendar (read-only here, for now). */
  const isGoogle = (calendarId: string) => !!db.prepare(`SELECT 1 FROM calendars WHERE id = ? AND provider = 'google'`).get(calendarId);
  const writable = (calendarId: string) =>
    !!syncedEdits && !!db.prepare('SELECT 1 FROM calendars WHERE id = ? AND writable = 1').get(calendarId);
  type Details = { title: string; allDay: boolean; start: string; end: string; location?: string | null };
  const details = (x: Details) => ({ title: x.title.trim(), allDay: x.allDay, start: x.start, end: x.end, location: x.location?.trim() || null });
  const rowDetails = (r: EventRow) => details({ ...r, allDay: r.all_day === 1 });

  // scope "all": a repeating iCloud event's every day (otherwise just the day that was opened).
  app.patch<{ Params: { id: string }; Body: Partial<EventInput> & { scope?: 'one' | 'all' } }>('/api/events/:id', {
    schema: { body: { ...eventBody, properties: { ...eventBody.properties, scope: { type: 'string', enum: ['one', 'all'] } }, minProperties: 1 } },
  }, async (req, reply) => {
    const row = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(req.params.id) as EventRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Event not found' });
    if (isGoogle(row.calendar_id)) return reply.code(409).send({ error: GOOGLE_READ_ONLY });
    if (row.calendar_id !== 'local' && !syncedEdits) return reply.code(409).send({ error: READ_ONLY });
    const ev: EventInput = {
      title: req.body.title ?? row.title,
      memberIds: req.body.memberIds ?? JSON.parse(row.member_ids),
      allDay: req.body.allDay ?? row.all_day === 1,
      start: req.body.start ?? row.start,
      end: req.body.end ?? row.end,
      location: req.body.location === undefined ? row.location : req.body.location,
      notes: req.body.notes === undefined ? row.notes : req.body.notes?.trim() || null,
      photoId: req.body.photoId === undefined ? row.photo_id : req.body.photoId,
    };
    const err = validateTimes(ev);
    if (err) return reply.code(400).send({ error: err });
    if (!allMembersExist(db, ev.memberIds)) return reply.code(400).send({ error: 'Unknown member' });
    if (!knownPhoto(ev.photoId)) return reply.code(400).send({ error: 'Unknown photo' });
    const next = details(ev);
    // Notes are the opened event's own (not its copies'): changed only when they're being set.
    const notesChange = req.body.notes === undefined ? {} : { notes: ev.notes ?? null };
    if (row.calendar_id !== 'local' && req.body.scope === 'all' && row.remote_id?.includes('#')) {
      // Every day of a repeating event: a new title or address, and the same move for every day.
      const was = rowDetails(row);
      if (next.allDay !== was.allDay) return reply.code(400).send({ error: 'Change all day for every repeat on your phone' });
      const changes: { title?: string; location?: string | null; shiftMs?: number; durationMs?: number } = {};
      if (next.title !== was.title) changes.title = next.title;
      if (next.location !== was.location) changes.location = next.location;
      if (!was.allDay) {
        const shiftMs = Date.parse(next.start) - Date.parse(was.start);
        if (shiftMs) changes.shiftMs = shiftMs;
        const length = Date.parse(next.end) - Date.parse(next.start);
        if (length !== Date.parse(was.end) - Date.parse(was.start)) changes.durationMs = length;
      } else if (next.start !== was.start || next.end !== was.end) {
        return reply.code(400).send({ error: 'Move every day of an all-day repeating event on your phone' });
      }
      if (Object.keys(changes).length) {
        queueSeries(db, row, 'update', changes);
        syncedEdits!.soon();
      }
      if (req.body.memberIds && JSON.stringify(ev.memberIds) !== row.member_ids) assignManually(db, row.id, ev.memberIds);
      return getEvent(row.id);
    }
    const copies = copiesOf(row);
    /** Makes the change to one copy: on the wall directly, or queued for iCloud. */
    const change = (r: EventRow) => {
      if (r.calendar_id === 'local') {
        db.prepare(`UPDATE events SET title = ?, all_day = ?, start = ?, end = ?, location = ?,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
          .run(next.title, next.allDay ? 1 : 0, next.start, next.end, next.location, r.id);
        // Notes and the flyer belong to the one opened, not its copies.
        if (r.id === row.id) db.prepare('UPDATE events SET notes = ?, photo_id = ? WHERE id = ?').run(ev.notes ?? null, ev.photoId ?? null, r.id);
      } else if (r.id === row.id || writable(r.calendar_id)) {
        const changes = diff({ ...rowDetails(r), notes: r.notes }, r.id === row.id ? { ...next, ...notesChange } : next);
        if (Object.keys(changes).length) queueEdit(db, r, 'update', changes);
      }
    };
    db.transaction(() => {
      change(row);
      copies.forEach(change);
      if (row.calendar_id === 'local') setMembers(row.id, ev.memberIds);
      else if (req.body.photoId !== undefined) setFlyer(db, row.id, ev.photoId ?? null);
    })();
    if (row.calendar_id !== 'local' || copies.some((c) => c.calendar_id !== 'local')) syncedEdits?.soon();
    // iCloud events: who it's for stays on this display (every repeat).
    if (row.calendar_id !== 'local' && req.body.memberIds && JSON.stringify(ev.memberIds) !== row.member_ids) {
      assignManually(db, row.id, ev.memberIds);
    }
    return getEvent(row.id);
  });

  // ?scope=all deletes every day of a repeating iCloud event.
  app.delete<{ Params: { id: string }; Querystring: { scope?: 'one' | 'all' } }>('/api/events/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as EventRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Event not found' });
    if (row.calendar_id !== 'local') {
      if (isGoogle(row.calendar_id)) return reply.code(409).send({ error: GOOGLE_READ_ONLY });
      if (!syncedEdits) return reply.code(409).send({ error: READ_ONLY });
      // Hidden here now; deleted in iCloud after the Undo window.
      if (req.query.scope === 'all' && row.remote_id?.includes('#')) {
        queueSeries(db, row, 'delete', {});
      } else {
        db.transaction(() => {
          queueEdit(db, row, 'delete', {});
          // Other iCloud copies of it go too (Undo brings them back with it).
          for (const c of copiesOf(row)) if (c.calendar_id !== 'local' && writable(c.calendar_id)) queueEdit(db, c, 'delete', {});
        })();
      }
      syncedEdits.soon();
      return reply.code(204).send();
    }
    db.transaction(() => {
      setVisibility(db, req.params.id, null);
      db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    })();
    return reply.code(204).send();
  });

  // Undo for deleting an iCloud event, before the delete is sent.
  app.post<{ Params: { id: string } }>('/api/events/:id/restore', async (req, reply) => {
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as EventRow | undefined;
    if (!row || !cancelDelete(db, row)) return reply.code(404).send({ error: 'Nothing to undo' });
    // Its copies in other calendars, deleted with it, come back too.
    for (const c of copiesOf(row, true)) cancelDelete(db, c);
    return getEvent(row.id);
  });

  // ---- Edits waiting for iCloud ---------------------------------------------------
  /** Edits waiting and conflicts, leaving out conflicts over events this viewer can't see in full. */
  function visibleOutbox(viewer: Viewer | undefined) {
    if (!viewer) return outboxStatus(db);
    const eventOf = db.prepare('SELECT id FROM events WHERE calendar_id = ? AND remote_id = ?');
    return outboxStatus(db, (calendarId, remoteId) => {
      const ev = eventOf.get(calendarId, remoteId) as { id: string } | undefined;
      // Deleted in iCloud: only guardians sort those out.
      return ev ? eventAccess(db, viewer, ev.id) === 'full' : viewer.role === 'guardian';
    });
  }
  app.get('/api/outbox', async (req) => visibleOutbox(req.raw.viewer));

  app.post<{ Params: { id: string }; Body: { keep: 'mine' | 'theirs' } }>('/api/outbox/:id/resolve', {
    schema: { body: { type: 'object', required: ['keep'], additionalProperties: false,
      properties: { keep: { type: 'string', enum: ['mine', 'theirs'] } } } },
  }, async (req, reply) => {
    if (!resolveConflict(db, Number(req.params.id), req.body.keep)) return reply.code(404).send({ error: 'Already settled' });
    if (req.body.keep === 'mine') syncedEdits?.soon();
    return visibleOutbox(req.raw.viewer);
  });

  // Who sees an event (every repeat of it): everyone, busy or private; null goes back to its calendar's default.
  app.put<{ Params: { id: string }; Body: { visibility: Visibility | null } }>('/api/events/:id/visibility', {
    schema: { body: { type: 'object', required: ['visibility'], additionalProperties: false,
      properties: { visibility: { enum: [...VISIBILITIES, null] } } } },
  }, async (req, reply) => {
    if (!setVisibility(db, req.params.id, req.body.visibility)) return reply.code(404).send({ error: 'Event not found' });
    return getEvent(req.params.id);
  });

  // Marked special or not (every repeat of it): a countdown on kid mode's Today.
  app.put<{ Params: { id: string }; Body: { special: boolean } }>('/api/events/:id/special', {
    schema: { body: { type: 'object', required: ['special'], additionalProperties: false, properties: { special: { type: 'boolean' } } } },
  }, async (req, reply) => {
    if (!setSpecial(db, req.params.id, req.body.special)) return reply.code(404).send({ error: 'Event not found' });
    return getEvent(req.params.id);
  });

  // Who a synced event is for (none = everyone). Applies to every repeat of it and survives future syncs.
  app.put<{ Params: { id: string }; Body: { memberIds: string[] } }>('/api/events/:id/people', {
    schema: { body: { type: 'object', required: ['memberIds'], additionalProperties: false,
      properties: { memberIds: eventBody.properties.memberIds } } },
  }, async (req, reply) => {
    if (!allMembersExist(db, req.body.memberIds)) return reply.code(400).send({ error: 'Unknown member' });
    if (!assignManually(db, req.params.id, req.body.memberIds)) {
      return reply.code(404).send({ error: 'Synced event not found' });
    }
    return getEvent(req.params.id);
  });
}
