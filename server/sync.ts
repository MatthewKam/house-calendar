import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import type { CalendarSource, CalendarWriter, RemoteEvent } from './providers/types.ts';
import { icalStore } from './providers/icalStore.ts';
import { eventId, overlayOutbox, pushOutbox, SEND_AFTER_MS } from './outbox.ts';
import { applyPeople } from './people.ts';
import { CalDavAuthError } from './providers/caldav.ts';
import { gaveWay, handOver, refusedSince as storedRefusal, setRefused } from './handover.ts';
import type { SyncStatus } from '../shared/calendars.ts';

/** How far around today synced events are kept. Further out shows only events added on the wall. */
const MONTHS_BACK = 3;
const MONTHS_AHEAD = 13;

/** How syncing is going (shared/calendars.ts). */
export type { SyncStatus };

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
	const fetched = await Promise.all(
		remote.map(async (cal) => ({ cal, events: await source.fetchRange(cal.remoteId, from, to) })),
	);

	const insertCal = db.prepare(
		'INSERT INTO calendars (id, provider, source, remote_id, name, color, writable, member_id, account) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
	);
	const updateCal = db.prepare('UPDATE calendars SET name = ?, color = ?, writable = ?, account = ? WHERE id = ?');
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
				insertCal.run(
					row.id,
					source.id,
					key,
					cal.remoteId,
					cal.name,
					cal.color ?? null,
					cal.writable === false ? 0 : 1,
					cal.primary && source.memberId ? source.memberId : null,
					cal.account ?? null,
				);
			} else {
				updateCal.run(cal.name, cal.color ?? null, cal.writable === false ? 0 : 1, cal.account ?? null, row.id);
			}
			keep.push(row.id);
			clearEvents.run(row.id);
			for (const ev of list) insertEvent.run(toRow(row.id, ev));
			events += list.length;
		}
		// Calendars deleted (or unshared) in the account go away here, taking their events with them.
		db.prepare(`DELETE FROM calendars WHERE source = ? AND id NOT IN (SELECT value FROM json_each(?))`).run(
			key,
			JSON.stringify(keep),
		);
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
	const done = list
		.map((s) => s.lastSuccess)
		.filter((t): t is string => !!t)
		.sort();
	return {
		provider: list[0].provider,
		running: list.some((s) => s.running),
		lastSuccess: done[0] ?? null,
		// Each problem once, however many accounts have it.
		lastError: [...new Set(list.map((s) => s.lastError).filter(Boolean))].join('; ') || null,
		calendars: list.reduce((n, s) => n + s.calendars, 0),
		events: list.reduce((n, s) => n + s.events, 0),
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
/** Opening Sprig syncs at most this often (each device opening it would otherwise ask again). */
export const OPEN_GAP_MS = 30_000;
const REFUSED_FOR_NOW = "iCloud isn't letting Sprig in right now; trying again every few minutes";
const REFUSED_FOR_GOOD =
	'iCloud has refused the Apple ID or app-specific password for over an hour. Make a new app-specific password at account.apple.com';

/** What the banner says for a failed sync: a refused sign-in by how long it's been refused (since `refusedSince`). */
export function syncError(err: unknown, refusedSince: number | null, now = Date.now()) {
	if (err instanceof CalDavAuthError)
		return refusedSince !== null && now - refusedSince >= REFUSED_PATIENCE_MS ? REFUSED_FOR_GOOD : REFUSED_FOR_NOW;
	return err instanceof Error ? err.message : String(err);
}

/** The phones whose calendars a password source's could be: its person's, or everyone's for the household's own. */
function phonesOf(db: DB, memberId: string | null | undefined) {
	const rows = memberId
		? db.prepare('SELECT id FROM phones WHERE member_id = ?').all(memberId)
		: db.prepare('SELECT id FROM phones').all();
	return (rows as { id: string }[]).map((r) => r.id);
}

/**
 * Whether a refused password's calendars are all on a phone now: it gave way, none of its own are left,
 * and one of the phones sent its calendars in the last day.
 */
function coveredByPhone(db: DB, key: string, memberId: string | null | undefined) {
	if (!gaveWay(db, key)) return false;
	if (db.prepare('SELECT 1 FROM calendars WHERE source = ? LIMIT 1').get(key)) return false;
	const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
	return phonesOf(db, memberId).some(
		(id) =>
			(db.prepare('SELECT last_sync FROM phones WHERE id = ?').get(id) as { last_sync: string }).last_sync >= since,
	);
}

/** Live status for the API, plus start() to sync now and then every `intervalMs`. */
export function createSync(db: DB, source: CalendarSource & Partial<CalendarWriter>, intervalMs = 5 * 60_000) {
	// Where the wall's edits go: the service's own store (Google), or iCloud's resources; null: read only.
	const writer = source.store ?? (source.getEvent && source.writeEvent ? icalStore(source as CalendarWriter) : null);
	const status: SyncStatus = {
		provider: source.id,
		running: false,
		lastSuccess: null,
		lastError: null,
		calendars: 0,
		events: 0,
		canWrite: !!writer,
	};
	const key = source.key ?? source.id;
	/** When iCloud started refusing the sign-in (null: it isn't); kept through restarts (handover.ts). */
	let refusedSince: number | null = storedRefusal(db, key);
	let timer: NodeJS.Timeout | undefined;
	let soonTimer: NodeJS.Timeout | undefined;
	let again = false;
	/** When the last pass started (0: none yet). */
	let lastRun = 0;
	let log: Log = console as unknown as Log;

	async function run() {
		if (status.running) {
			again = true;
			return;
		}
		status.running = true;
		lastRun = Date.now();
		try {
			// Edits from the wall go first, so the snapshot that follows includes them.
			if (writer) {
				const sent = await pushOutbox(db, writer, new Date(), source.key ?? source.id);
				if (sent.sent || sent.conflicts || sent.failed) log.info(sent, `sent wall edits to ${source.id}`);
			}
			const result = await syncOnce(db, source);
			Object.assign(status, result, { lastSuccess: new Date().toISOString(), lastError: null });
			if (refusedSince !== null) setRefused(db, key, null);
			refusedSince = null;
			// Working again: it takes back any calendars a phone's copy took over while it was refused.
			if (source.id === 'icloud') {
				const took = phonesOf(db, source.memberId).reduce((n, p) => n + handOver(db, `phone:${p}`, [key]), 0);
				if (took) log.info({ events: took }, 'iCloud took its calendars back from the phone');
			}
			log.info(result, `${source.id} sync done`);
		} catch (err) {
			// Refused: since when (kept through other errors in between, until a sync goes through).
			if (err instanceof CalDavAuthError) {
				refusedSince ??= Date.now();
				setRefused(db, key, refusedSince);
			}
			// Nothing to warn about while a phone's copy has taken its calendars over (handover.ts).
			status.lastError = coveredByPhone(db, key, source.memberId) ? null : syncError(err, refusedSince);
			log.error({ err }, `${source.id} sync failed`);
		} finally {
			status.running = false;
		}
		if (again) {
			again = false;
			void run();
		}
	}

	return {
		status,
		start(logger: Log) {
			log = logger;
			void run();
			timer = setInterval(run, intervalMs);
		},
		/** Whether edits made on the wall can be sent to this calendar service. */
		canWrite: !!writer,
		/** Sends what's waiting now (a new event, or undoing one), then syncs. */
		sendNow: () => void run(),
		/** Sends a new wall edit (and syncs) once its Undo window has passed. */
		soon() {
			clearTimeout(soonTimer);
			soonTimer = setTimeout(() => void run(), SEND_AFTER_MS + 1_000);
			soonTimer.unref?.();
		},
		/**
		 * Someone opened Sprig: sync now, unless a pass started in the last `minGapMs` (or is running),
		 * so changes made in the calendar's own app show without waiting for the next interval.
		 * Resolves when it's done; null when it didn't start one.
		 */
		now(minGapMs = OPEN_GAP_MS): Promise<void> | null {
			if (status.running || Date.now() - lastRun < minGapMs) return null;
			return run();
		},
		stop: () => {
			clearInterval(timer);
			clearTimeout(soonTimer);
		},
	};
}
