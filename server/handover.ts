import type { DB } from './db.ts';
import { REFUSED_PATIENCE_MS } from './sync.ts';

// One iCloud calendar can come in two ways: with an app-specific password (the server reads iCloud, and
// can send changes back), or from someone's iPhone (the app reads the phone's calendars; read-only here).
// The password's copy is kept while it works. Once iCloud has refused the password for over an hour, the
// phone's copy takes over; when the password works again, it takes back. Each time, what Sprig keeps
// about an event (who it's for, who sees it, special days, flyers, what to bring, reminders, the day's
// note and list) moves with it, so nothing is left behind on the copy that goes.

/** Since when iCloud has refused this password source's sign-in (null: it hasn't). */
export function refusedSince(db: DB, source: string): number | null {
	const row = db.prepare('SELECT since FROM sync_refused WHERE source = ?').get(source) as
		{ since: string } | undefined;
	return row ? Date.parse(row.since) : null;
}

/** Saves when the refusing started (kept from the first time), or that it's over (null). */
export function setRefused(db: DB, source: string, since: number | null) {
	if (since === null) db.prepare('DELETE FROM sync_refused WHERE source = ?').run(source);
	else
		db.prepare('INSERT OR IGNORE INTO sync_refused (source, since) VALUES (?, ?)').run(
			source,
			new Date(since).toISOString(),
		);
}

/** Whether the password has been refused long enough for a phone's copy to take over. */
export function gaveWay(db: DB, source: string, now = Date.now()) {
	const since = refusedSince(db, source);
	return since !== null && now - since >= REFUSED_PATIENCE_MS;
}

/**
 * The password sources covering someone's iCloud: their own connection, and the household from before
 * accounts (its .env password, everyone's).
 */
export function passwordSources(db: DB, memberId: string): string[] {
	const own = (
		db.prepare(`SELECT id FROM connections WHERE provider = 'icloud' AND member_id = ?`).all(memberId) as {
			id: string;
		}[]
	).map((r) => `icloud:${r.id}`);
	const legacy = db.prepare(`SELECT 1 FROM calendars WHERE source = 'icloud' LIMIT 1`).get() ? ['icloud'] : [];
	// A legacy household that gave way has no calendars left under 'icloud': still its source.
	const refused = (db.prepare(`SELECT source FROM sync_refused WHERE source = 'icloud'`).all() as { source: string }[])
		.map((r) => r.source)
		.filter((s) => !legacy.includes(s));
	return [...own, ...legacy, ...refused];
}

interface Cal {
	id: string;
	name: string;
}
/** A source's calendars; from a phone, only its iCloud ones (its others are the phone's alone). */
const calendarsOf = (db: DB, source: string) =>
	db
		.prepare(
			`SELECT id, name FROM calendars WHERE source = ? AND (source NOT LIKE 'phone:%' OR account LIKE '%icloud%')`,
		)
		.all(source) as Cal[];

/** Each repeating event (or single one) in a calendar: its series key, title, and when it first starts. */
function seriesOf(db: DB, calendarId: string) {
	const rows = db
		.prepare(`SELECT COALESCE(series_id, id) s, title, all_day, start FROM events WHERE calendar_id = ? ORDER BY start`)
		.all(calendarId) as { s: string; title: string; all_day: number; start: string }[];
	const out = new Map<string, { title: string; at: string }>();
	for (const r of rows) {
		if (out.has(r.s)) continue;
		// The time of day it starts (the same instant on both copies), so two "Dentist"s can be told apart.
		const at = r.all_day ? 'all day' : new Date(r.start).toISOString().slice(11, 16);
		out.set(r.s, { title: r.title.trim().toLowerCase(), at });
	}
	return out;
}

/** Which series in `from` is which in `to`: by title and time of day, or by title alone when that's unique. */
export function matchSeries(db: DB, from: string, to: string): [string, string][] {
	const a = seriesOf(db, from);
	const b = seriesOf(db, to);
	const index = (m: Map<string, { title: string; at: string }>, key: (v: { title: string; at: string }) => string) => {
		const out = new Map<string, string[]>();
		for (const [s, v] of m) out.set(key(v), [...(out.get(key(v)) ?? []), s]);
		return out;
	};
	const pairs: [string, string][] = [];
	const used = new Set<string>();
	for (const key of [(v: { title: string; at: string }) => `${v.title}|${v.at}`, (v: { title: string }) => v.title]) {
		const ia = index(a, key);
		const ib = index(b, key);
		for (const [k, ss] of ia) {
			const ts = ib.get(k);
			// Only a match there's no doubt about: one on each side.
			if (ss.length !== 1 || ts?.length !== 1 || used.has(ss[0]) || used.has(ts[0])) continue;
			pairs.push([ss[0], ts[0]]);
			used.add(ss[0]);
			used.add(ts[0]);
		}
	}
	return pairs;
}

/** Moves what Sprig keeps about each matched event, and the calendar's own settings, from one copy to the other. */
export function moveEventThings(db: DB, from: string, to: string) {
	const pairs = matchSeries(db, from, to);
	const per = (table: string, col: string) =>
		db.prepare(
			`UPDATE OR IGNORE ${table} SET calendar_id = @to, ${col} = @b WHERE calendar_id = @from AND ${col} = @a`,
		);
	const tables = [
		per('event_people', 'series_id'),
		per('event_privacy', 'series_key'),
		per('event_special', 'series_key'),
		per('event_flyers', 'series_key'),
	];
	// A list of what to bring moves only if the other copy has none of its own yet.
	const checklist = db.prepare(
		`UPDATE event_checklist SET calendar_id = @to, series_key = @b WHERE calendar_id = @from AND series_key = @a
       AND NOT EXISTS (SELECT 1 FROM event_checklist WHERE calendar_id = @to AND series_key = @b)`,
	);
	const notes = db.prepare('UPDATE OR IGNORE day_notes SET key = @n WHERE key = @o');
	const list = db.prepare(
		'UPDATE day_list SET key = @n WHERE key = @o AND NOT EXISTS (SELECT 1 FROM day_list WHERE key = @n)',
	);
	const reminders = db.prepare('UPDATE special_reminders SET key = @n WHERE key = @o');
	db.transaction(() => {
		for (const [a, b] of pairs) {
			for (const t of tables) t.run({ from, to, a, b });
			checklist.run({ from, to, a, b });
			const keys = { o: `series:${from}:${a}`, n: `series:${to}:${b}` };
			notes.run(keys);
			list.run(keys);
			reminders.run(keys);
		}
		// The calendar's own settings: hidden or not, who sees it, whose it is.
		db.prepare(
			`UPDATE calendars SET hidden = f.hidden, visibility = f.visibility, member_id = COALESCE(f.member_id, calendars.member_id)
         FROM (SELECT hidden, visibility, member_id FROM calendars WHERE id = ?) f WHERE calendars.id = ?`,
		).run(from, to);
	})();
	return pairs.length;
}

/**
 * Hands each calendar in `fromSource` to the calendar of the same name in `toSources`, then removes it:
 * the phone's copy taking over from a refused password, or the password's taking back.
 */
export function handOver(db: DB, fromSource: string, toSources: string[]) {
	const targets = toSources.flatMap((s) => calendarsOf(db, s));
	let moved = 0;
	for (const cal of calendarsOf(db, fromSource)) {
		const same = targets.filter((t) => t.name === cal.name);
		if (same.length !== 1) continue;
		moved += moveEventThings(db, cal.id, same[0].id);
		db.prepare('DELETE FROM calendars WHERE id = ?').run(cal.id);
	}
	return moved;
}
