import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import type { CalendarSource, CalendarWriter, RemoteEvent } from './providers/types.ts';
import { eventId, overlayOutbox, pushOutbox, SEND_AFTER_MS } from './outbox.ts';
import { applyPeople, assignPending, type Classify } from './people.ts';
import { CalDavAuthError } from './providers/caldav.ts';

/** How far around today synced events are kept. Further out shows only events added on the wall. */
const MONTHS_BACK = 3;
const MONTHS_AHEAD = 13;

export interface SyncStatus {
  provider: CalendarSource['id'];
  /** True while a sync is running. */
  running: boolean;
  lastSuccess: string | null;
  lastError: string | null;
  calendars: number;
  events: number;
  /** Set when Claude couldn't sort events by person; the sync itself still succeeded. */
  peopleError: string | null;
  /** Whether events can be changed on the wall and sent back. */
  canWrite: boolean;
}

function syncWindow(now = new Date()) {
  return {
    from: new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1),
    to: new Date(now.getFullYear(), now.getMonth() + MONTHS_AHEAD, 1),
  };
}


/**
 * One pass: refresh the calendar list, then replace each calendar's stored events with a fresh
 * snapshot. Everything is fetched before anything is written, so a failed fetch leaves the
 * previous copy on screen.
 */
export async function syncOnce(db: DB, source: CalendarSource, now = new Date()) {
  const { from, to } = syncWindow(now);
  const key = source.key ?? source.id;
  const findCal = db.prepare('SELECT id, source FROM calendars WHERE provider = ? AND remote_id = ?');
  // A calendar another account already brings in (one shared with both parents, say) is shown once.
  const remote = (await source.listCalendars()).filter((cal) => {
    const row = findCal.get(source.id, cal.remoteId) as { source: string | null } | undefined;
    return !row || row.source === key;
  });
  const fetched = await Promise.all(remote.map(async (cal) => ({ cal, events: await source.fetchRange(cal.remoteId, from, to) })));

  const insertCal = db.prepare('INSERT INTO calendars (id, provider, source, remote_id, name, color, writable, member_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const updateCal = db.prepare('UPDATE calendars SET name = ?, color = ?, writable = ? WHERE id = ?');
  const clearEvents = db.prepare('DELETE FROM events WHERE calendar_id = ?');
  // Who each event is for is filled in afterwards by applyPeople().
  const insertEvent = db.prepare(`
    INSERT INTO events (id, calendar_id, title, all_day, start, end, location, notes, remote_id, series_id, etag, sync_state)
    VALUES (@id, @calendarId, @title, @allDay, @start, @end, @location, @notes, @remoteId, @seriesId, @etag, 'synced')
    ON CONFLICT(id) DO NOTHING`);

  let events = 0;
  db.transaction(() => {
    const keep: string[] = [];
    for (const { cal, events: list } of fetched) {
      let row = findCal.get(source.id, cal.remoteId) as { id: string } | undefined;
      if (!row) {
        row = { id: randomUUID() };
        insertCal.run(row.id, source.id, key, cal.remoteId, cal.name, cal.color ?? null, cal.writable === false ? 0 : 1,
          cal.primary && source.memberId ? source.memberId : null);
      } else {
        updateCal.run(cal.name, cal.color ?? null, cal.writable === false ? 0 : 1, row.id);
      }
      keep.push(row.id);
      clearEvents.run(row.id);
      for (const ev of list) insertEvent.run(toRow(row.id, ev));
      events += list.length;
    }
    // Calendars deleted (or unshared) in the account go away here, taking their events with them.
    db.prepare(`DELETE FROM calendars WHERE source = ? AND id NOT IN (SELECT value FROM json_each(?))`)
      .run(key, JSON.stringify(keep));
    applyPeople(db);
    // Edits made on the wall that iCloud doesn't have yet stay on screen.
    overlayOutbox(db);
  })();

  return { calendars: remote.length, events };
}

const toRow = (calendarId: string, ev: RemoteEvent) => ({
  id: eventId(calendarId, ev.remoteId),
  calendarId,
  title: ev.title.slice(0, 200),
  allDay: ev.allDay ? 1 : 0,
  start: ev.start,
  end: ev.end,
  remoteId: ev.remoteId,
  // Every occurrence of a repeating event shares its resource URL, the part before '#'.
  seriesId: ev.remoteId.split('#')[0],
  location: ev.location ?? null,
  notes: ev.notes?.slice(0, 4000) ?? null,
  etag: ev.etag,
});

/** One status for every account a household syncs (iCloud, each person's Google), for the banner. */
export function combineStatus(list: SyncStatus[]): SyncStatus | null {
  if (list.length <= 1) return list[0] ?? null;
  const done = list.map((s) => s.lastSuccess).filter((t): t is string => !!t).sort();
  return {
    provider: list[0].provider,
    running: list.some((s) => s.running),
    lastSuccess: done[0] ?? null,
    lastError: list.map((s) => s.lastError).filter(Boolean).join('; ') || null,
    calendars: list.reduce((n, s) => n + s.calendars, 0),
    events: list.reduce((n, s) => n + s.events, 0),
    peopleError: list.find((s) => s.peopleError)?.peopleError ?? null,
    canWrite: list.some((s) => s.canWrite),
  };
}

interface Log {
  info: (o: object, m: string) => void;
  error: (o: object, m: string) => void;
}

/**
 * How long iCloud can refuse the sign-in before it's taken as the password being wrong: until then,
 * it's more likely iCloud having trouble (it refuses then too), and the banner says so.
 */
export const REFUSED_PATIENCE_MS = 60 * 60_000;
const REFUSED_FOR_NOW = "iCloud isn't letting Sprig in right now; trying again every few minutes";
const REFUSED_FOR_GOOD = 'iCloud has refused the Apple ID or app-specific password for over an hour. Make a new app-specific password at account.apple.com';

/** What the banner says for a failed sync: a refused sign-in by how long it's been refused (since `refusedSince`). */
export function syncError(err: unknown, refusedSince: number | null, now = Date.now()) {
  if (err instanceof CalDavAuthError) return refusedSince !== null && now - refusedSince >= REFUSED_PATIENCE_MS ? REFUSED_FOR_GOOD : REFUSED_FOR_NOW;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Live status for the API, plus start() to sync now and then every `intervalMs`. With a classifier,
 * each pass also has Claude pick who new events are for.
 */
export function createSync(db: DB, source: CalendarSource & Partial<CalendarWriter>, classify: Classify | null, intervalMs = 5 * 60_000) {
  const writer = source.getEvent && source.writeEvent ? (source as CalendarWriter) : null;
  const status: SyncStatus = {
    provider: source.id, running: false, lastSuccess: null, lastError: null, calendars: 0, events: 0, peopleError: null,
    canWrite: !!writer,
  };
  /** When iCloud started refusing the sign-in (null: it isn't). */
  let refusedSince: number | null = null;
  let timer: NodeJS.Timeout | undefined;
  let soonTimer: NodeJS.Timeout | undefined;
  let again = false;
  let log: Log = console as unknown as Log;

  async function run() {
    if (status.running) {
      again = true;
      return;
    }
    status.running = true;
    try {
      // Edits from the wall go first, so the snapshot that follows includes them.
      if (writer) {
        const sent = await pushOutbox(db, writer, new Date(), source.key ?? source.id);
        if (sent.sent || sent.conflicts || sent.failed) log.info(sent, 'sent wall edits to iCloud');
      }
      const result = await syncOnce(db, source);
      Object.assign(status, result, { lastSuccess: new Date().toISOString(), lastError: null });
      refusedSince = null;
      log.info(result, `${source.id} sync done`);
    } catch (err) {
      // Refused: since when (kept through other errors in between, until a sync goes through).
      if (err instanceof CalDavAuthError) refusedSince ??= Date.now();
      status.lastError = syncError(err, refusedSince);
      log.error({ err }, `${source.id} sync failed`);
    } finally {
      status.running = false;
    }
    await assignPeople();
    if (again) {
      again = false;
      void run();
    }
  }

  let assigning: Promise<void> | null = null;
  /** Sorts unassigned series by person. Safe to call any time; overlapping calls share one run. */
  function assignPeople() {
    if (!classify) return Promise.resolve();
    assigning ??= (async () => {
      try {
        const assigned = await assignPending(db, classify);
        status.peopleError = null;
        if (assigned) log.info({ assigned }, 'Claude assigned people to events');
      } catch (err) {
        status.peopleError = err instanceof Error ? err.message : String(err);
        log.error({ err }, 'assigning people failed');
      } finally {
        assigning = null;
      }
    })();
    return assigning;
  }

  return {
    status,
    assignPeople,
    start(logger: Log) {
      log = logger;
      void run();
      timer = setInterval(run, intervalMs);
    },
    /** Whether edits made on the wall can be sent to this calendar service. */
    canWrite: !!writer,
    /** Sends a new wall edit (and syncs) once its Undo window has passed. */
    soon() {
      clearTimeout(soonTimer);
      soonTimer = setTimeout(() => void run(), SEND_AFTER_MS + 1_000);
      soonTimer.unref?.();
    },
    stop: () => {
      clearInterval(timer);
      clearTimeout(soonTimer);
    },
  };
}
