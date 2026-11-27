import type { DB } from './db.ts';
import type { RemoteEvent } from './providers/types.ts';
import type { Details } from './providers/icalEdit.ts';
import {
	changedThere,
	eventId,
	isSeries,
	markConflict,
	NEW_ON_PHONE,
	overlayOutbox,
	same,
	seriesClash,
	type OutboxRow,
} from './outbox.ts';
import { moveSeries } from './handover.ts';
import { applyPeople } from './people.ts';
import type { PhoneEdit, PhoneEditResults } from '../shared/calendars.ts';

// Edits made in Sprig to a phone's calendars (phoneCalendars.ts). Only the phone can save them, with
// EventKit, so they wait in the outbox (outbox.ts) like iCloud's and Google's until it sends its calendars.
// Then each is checked against what it sent, as pushOutbox checks iCloud's: changed there too, it's a
// conflict for the wall to settle; otherwise it's handed back for the phone to save, and the phone says
// how that went (takePhoneResults).

type Row = OutboxRow & { calendar_remote: string };

/** The rows waiting for this phone whose Undo has passed, in its calendars that it can save to. */
const waiting = (db: DB, source: string, now: Date) =>
	db
		.prepare(
			`SELECT o.*, c.remote_id AS calendar_remote FROM event_outbox o JOIN calendars c ON c.id = o.calendar_id
    WHERE c.source = ? AND c.writable = 1 AND o.state = 'pending' AND o.send_after <= ? ORDER BY o.id`,
		)
		.all(source, now.toISOString()) as Row[];

const detailsOf = (e: RemoteEvent): Details => ({
	title: e.title,
	allDay: e.allDay,
	start: e.start,
	end: e.end,
	location: e.location ?? null,
	notes: e.notes ?? null,
});

/**
 * After a phone sent its calendars (`events`, as stored): the edits for it to save now. Ones changed on the
 * phone too become conflicts; ones it already has (saved before, but the result never came) are done.
 */
export function editsForPhone(db: DB, phone: string, events: RemoteEvent[], now = new Date()): PhoneEdit[] {
	const rows = waiting(db, `phone:${phone}`, now);
	if (rows.length === 0) return [];
	const byId = new Map(events.map((e) => [e.remoteId, e]));
	const bySeries = new Map<string, RemoteEvent>();
	for (const e of events) {
		const s = e.remoteId.split('#')[0];
		if (!bySeries.has(s)) bySeries.set(s, e);
	}
	const done = db.prepare('DELETE FROM event_outbox WHERE id = ?');
	const out: PhoneEdit[] = [];
	const hand = (r: Row) =>
		out.push({
			id: r.id,
			op: r.op,
			// The phone's own calendar id, without the "<phone>:" Sprig puts in front.
			calendarId: r.calendar_remote.slice(phone.length + 1),
			eventId: r.op === 'create' ? null : r.remote_id,
			series: isSeries(r),
			changes: (({ series: _s, ...rest }) => rest)(JSON.parse(r.changes) as Record<string, unknown>),
			version: r.changes,
		});
	db.transaction(() => {
		for (const r of rows) {
			if (r.op === 'create') {
				hand(r);
				continue;
			}
			if (isSeries(r)) {
				const e = bySeries.get(r.remote_id);
				const theirs = e ? { title: e.title, location: e.location ?? null } : null;
				if (r.op === 'delete') {
					if (theirs) hand(r);
					else done.run(r.id);
				} else if (seriesClash(r, theirs)) markConflict(db, r.id, theirs);
				else hand(r);
				continue;
			}
			const e = byId.get(r.remote_id);
			const theirs = e ? detailsOf(e) : null;
			if (r.op === 'delete') {
				// Already gone on the phone: nothing to do.
				if (theirs) hand(r);
				else done.run(r.id);
				continue;
			}
			const changes = JSON.parse(r.changes) as Partial<Details>;
			const has =
				theirs && (Object.keys(changes) as (keyof Details)[]).every((k) => same(k, theirs, changes as Details));
			if (has) done.run(r.id);
			else if (changedThere(r, theirs)) markConflict(db, r.id, theirs);
			else hand(r);
		}
		overlayOutbox(db);
	})();
	return out;
}

/** What the phone did with the edits it was handed. Returns how many it saved. */
export function takePhoneResults(db: DB, phone: string, results: PhoneEditResults['results']) {
	const get = db.prepare(
		`SELECT o.*, c.remote_id AS calendar_remote FROM event_outbox o JOIN calendars c ON c.id = o.calendar_id
    WHERE o.id = ? AND c.source = ?`,
	);
	let saved = 0;
	db.transaction(() => {
		for (const res of results) {
			const r = get.get(res.id, `phone:${phone}`) as Row | undefined;
			if (!r) continue;
			if (!res.saved) {
				db.prepare('UPDATE event_outbox SET attempts = attempts + 1, error = ? WHERE id = ?').run(
					res.error || "The phone couldn't save it",
					r.id,
				);
				continue;
			}
			let sent: Record<string, unknown>;
			try {
				sent = JSON.parse(res.version) as Record<string, unknown>;
			} catch {
				continue;
			}
			const isNew = r.remote_id.startsWith(NEW_ON_PHONE);
			// A new event can't be found again without the id the phone gave it.
			if (isNew && !res.eventId) continue;
			saved++;
			const unchanged = res.version === r.changes;
			if (isNew && r.op !== 'delete') {
				madeOnPhone(db, r, res.eventId!);
				// Changed again while the phone was saving it: that change is now an edit to the saved event.
				if (unchanged) db.prepare('DELETE FROM event_outbox WHERE id = ?').run(r.id);
				else
					db.prepare(`UPDATE event_outbox SET op = 'update', remote_id = ?, before = ? WHERE id = ?`).run(
						res.eventId,
						res.version,
						r.id,
					);
				continue;
			}
			if (isNew) {
				// Created, then deleted (Undo) while on its way: delete the one the phone just made.
				madeOnPhone(db, r, res.eventId!);
				db.prepare(`UPDATE event_outbox SET remote_id = ?, before = ?, send_after = ? WHERE id = ?`).run(
					res.eventId,
					res.version,
					new Date().toISOString(),
					r.id,
				);
				continue;
			}
			if (unchanged) {
				db.prepare('DELETE FROM event_outbox WHERE id = ?').run(r.id);
				continue;
			}
			// Changed again meanwhile: what the phone saved is the new starting point, and the rest waits.
			if (r.op === 'delete') continue;
			const before = JSON.parse(r.before) as Record<string, unknown>;
			const changes = JSON.parse(r.changes) as Record<string, unknown>;
			const { series: _s, shiftMs: shifted, durationMs: _d, ...kept } = sent;
			// Moves add up (queueSeries): only the part the phone hasn't made is left.
			if (typeof shifted === 'number') {
				const left = ((changes.shiftMs as number | undefined) ?? 0) - shifted;
				if (left) changes.shiftMs = left;
				else delete changes.shiftMs;
			}
			db.prepare('UPDATE event_outbox SET changes = ?, before = ? WHERE id = ?').run(
				JSON.stringify(changes),
				JSON.stringify({ ...before, ...kept }),
				r.id,
			);
		}
		overlayOutbox(db);
		applyPeople(db);
	})();
	return saved;
}

/** A new event is on the phone under the id it gave it: what Sprig keeps about it moves to that id. */
function madeOnPhone(db: DB, r: Row, phoneEventId: string) {
	const series = phoneEventId.split('#')[0];
	moveSeries(db, r.calendar_id, r.calendar_id, [[r.remote_id, series]]);
	const old = eventId(r.calendar_id, r.remote_id);
	db.prepare('DELETE FROM event_members WHERE event_id = ?').run(old);
	db.prepare(
		`UPDATE OR IGNORE events SET id = ?, remote_id = ?, series_id = ?, sync_state = 'synced' WHERE id = ?`,
	).run(eventId(r.calendar_id, phoneEventId), phoneEventId, series, old);
	// Already there under its new id (the phone sent it meanwhile): the stand-in goes.
	db.prepare('DELETE FROM events WHERE id = ?').run(old);
}
