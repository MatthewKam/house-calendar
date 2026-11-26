import type { DB } from './db.ts';

// Who each synced event is for: any number of family members, or nobody in particular ("Everyone").
// Order: a manual pick (per series, so one choice covers every repeat), then the person the calendar
// is linked to, then the family names in the event's title. No name found means Everyone, until
// someone picks. Plain code only: no AI, nothing leaves the server.

export interface Member {
	id: string;
	name: string;
}

const members = (db: DB) =>
	db.prepare('SELECT id, name FROM members ORDER BY sort_order, created_at').all() as Member[];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds family members named in a piece of text: the whole name or its first word, as a word of its
 * own in any case ("Sam - swim", "sam's class", "Riley & Sam"; not "Samba"). Ids in family order.
 */
export function namesIn(family: Member[]): (text: string) => string[] {
	const tests = family.flatMap((m) => {
		const full = m.name.trim();
		if (!full) return [];
		const first = full.split(/\s+/)[0];
		const names = [...new Set([full, first])].map(escape).join('|');
		return [{ id: m.id, re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${names})(?![\\p{L}\\p{N}])`, 'iu') }];
	});
	return (text) => tests.filter((t) => t.re.test(text)).map((t) => t.id);
}

/** Recomputes who synced events are for, for one calendar or (no id) all of them. */
export function applyPeople(db: DB, calendarId: string | null = null) {
	const scope = { cal: calendarId };
	db.prepare(
		`DELETE FROM event_members WHERE event_id IN
    (SELECT id FROM events WHERE calendar_id != 'local' AND (@cal IS NULL OR calendar_id = @cal))`,
	).run(scope);
	db.prepare(
		`
    INSERT OR IGNORE INTO event_members (event_id, member_id)
    SELECT e.id, j.value
    FROM events e
    JOIN calendars c ON c.id = e.calendar_id
    LEFT JOIN event_people p ON p.calendar_id = e.calendar_id AND p.series_id = e.series_id
    JOIN json_each(CASE
      WHEN p.source = 'manual' THEN p.member_ids
      ELSE json_array(c.member_id)
    END) j
    WHERE e.calendar_id != 'local' AND (@cal IS NULL OR e.calendar_id = @cal)
      AND (p.source = 'manual' OR c.member_id IS NOT NULL)
      AND j.value IN (SELECT id FROM members)`,
	).run(scope);

	// The rest: the family names in the title.
	const unpicked = db
		.prepare(
			`SELECT e.id, e.title
    FROM events e
    JOIN calendars c ON c.id = e.calendar_id
    LEFT JOIN event_people p ON p.calendar_id = e.calendar_id AND p.series_id = e.series_id AND p.source = 'manual'
    WHERE e.calendar_id != 'local' AND (@cal IS NULL OR e.calendar_id = @cal)
      AND p.series_id IS NULL AND c.member_id IS NULL`,
		)
		.all(scope) as { id: string; title: string }[];
	if (unpicked.length === 0) return;
	const named = namesIn(members(db));
	const add = db.prepare('INSERT OR IGNORE INTO event_members (event_id, member_id) VALUES (?, ?)');
	for (const e of unpicked) for (const id of named(e.title)) add.run(e.id, id);
}

/** Someone picked people (none = everyone) for a synced event; applies to the whole series. */
export function assignManually(db: DB, eventId: string, memberIds: string[]) {
	const ev = db.prepare('SELECT calendar_id, series_id FROM events WHERE id = ?').get(eventId) as
		{ calendar_id: string; series_id: string | null } | undefined;
	const seriesId = ev?.series_id;
	if (!ev || !seriesId) return false;
	db.transaction(() => {
		db.prepare(
			`INSERT INTO event_people (calendar_id, series_id, member_ids, source, basis) VALUES (?, ?, ?, 'manual', NULL)
                ON CONFLICT (calendar_id, series_id) DO UPDATE SET member_ids = excluded.member_ids, source = 'manual', basis = NULL`,
		).run(ev.calendar_id, seriesId, JSON.stringify([...new Set(memberIds)]));
		applyPeople(db, ev.calendar_id);
	})();
	return true;
}

/**
 * Before a member is removed: take them out of manual picks. One left with nobody is dropped, so the
 * series falls back to the calendar link or the names in its title rather than "Everyone".
 */
export function forgetMember(db: DB, memberId: string) {
	const rows = db
		.prepare(
			`SELECT calendar_id, series_id, member_ids, source FROM event_people
    WHERE EXISTS (SELECT 1 FROM json_each(member_ids) WHERE value = ?)`,
		)
		.all(memberId) as { calendar_id: string; series_id: string; member_ids: string; source: string }[];
	const update = db.prepare('UPDATE event_people SET member_ids = ? WHERE calendar_id = ? AND series_id = ?');
	const drop = db.prepare('DELETE FROM event_people WHERE calendar_id = ? AND series_id = ?');
	for (const r of rows) {
		const rest = (JSON.parse(r.member_ids) as string[]).filter((id) => id !== memberId);
		if (rest.length === 0 && r.source === 'manual') drop.run(r.calendar_id, r.series_id);
		else update.run(JSON.stringify(rest), r.calendar_id, r.series_id);
	}
}
