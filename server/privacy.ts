import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import type { Viewer } from './auth.ts';
import { localDay, stageOf } from './stages.ts';

// Privacy: who sees an event. Everyone (the default); Busy (anyone not on it sees a "Busy" block at
// that time, without its title, place or notes); Private (anyone not on it doesn't see it at all).
// The people on an event always see it, an event for no one in particular is for everyone, and
// guardians see their kids' events in full. The wall is no one in particular. Hidden details never
// leave the server. Without a viewer (tests, a household app used on its own) everything shows.

export const VISIBILITIES = ['everyone', 'busy', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
/** What a viewer gets of one event. */
export type Access = 'full' | 'busy' | 'none';

/** An event's visibility (alias `e`): its own, for every repeat, else its calendar's default. */
export const VISIBILITY_SQL = `COALESCE(
  (SELECT p.visibility FROM event_privacy p WHERE p.calendar_id = e.calendar_id AND p.series_key = COALESCE(e.series_id, e.id)),
  (SELECT c.visibility FROM calendars c WHERE c.id = e.calendar_id), 'everyone')`;

/** The kids: anyone with a stage below adult. */
export function kidIds(db: DB) {
	const rows = db.prepare('SELECT id, birthdate, stage FROM members').all() as {
		id: string;
		birthdate: string | null;
		stage: string | null;
	}[];
	const today = localDay();
	return new Set(
		rows
			.filter((m) => {
				const s = stageOf(m, today);
				return s !== null && s !== 'adult';
			})
			.map((m) => m.id),
	);
}

export function accessFor(
	viewer: Viewer | undefined,
	kids: Set<string>,
	visibility: string,
	memberIds: string[],
): Access {
	if (!viewer || visibility === 'everyone' || memberIds.length === 0) return 'full';
	if (viewer.memberId && memberIds.includes(viewer.memberId)) return 'full';
	if (viewer.role === 'guardian' && memberIds.some((id) => kids.has(id))) return 'full';
	return visibility === 'busy' ? 'busy' : 'none';
}

/** What a viewer gets of one event, by id; null when there's no such event. */
export function eventAccess(db: DB, viewer: Viewer | undefined, eventId: string): Access | null {
	if (!viewer) return db.prepare('SELECT 1 FROM events WHERE id = ?').get(eventId) ? 'full' : null;
	const row = db
		.prepare(
			`SELECT ${VISIBILITY_SQL} AS visibility,
      (SELECT json_group_array(member_id) FROM event_members WHERE event_id = e.id) AS member_ids
    FROM events e WHERE e.id = ?`,
		)
		.get(eventId) as { visibility: string; member_ids: string } | undefined;
	return row ? accessFor(viewer, kidIds(db), row.visibility, JSON.parse(row.member_ids)) : null;
}

/** Sets an event's own visibility (every repeat of it); null goes back to its calendar's default. */
export function setVisibility(db: DB, eventId: string, visibility: Visibility | null) {
	const ev = db.prepare('SELECT calendar_id, COALESCE(series_id, id) AS key FROM events WHERE id = ?').get(eventId) as
		{ calendar_id: string; key: string } | undefined;
	if (!ev) return false;
	if (visibility) {
		db.prepare(
			`INSERT INTO event_privacy (calendar_id, series_key, visibility) VALUES (?, ?, ?)
      ON CONFLICT (calendar_id, series_key) DO UPDATE SET visibility = excluded.visibility`,
		).run(ev.calendar_id, ev.key, visibility);
	} else {
		db.prepare('DELETE FROM event_privacy WHERE calendar_id = ? AND series_key = ?').run(ev.calendar_id, ev.key);
	}
	return true;
}

/**
 * Routes that act on one event (/api/events/:id/..., and an alert's eventId) need to see all of it:
 * an event they can't see isn't found, and a Busy one can't be opened or changed.
 */
export function registerPrivacyGuard(app: FastifyInstance, db: DB) {
	app.addHook('preHandler', async (req, reply) => {
		const viewer = req.raw.viewer;
		if (!viewer) return;
		const url = req.routeOptions.url ?? '';
		const id = url.startsWith('/api/events/:id')
			? (req.params as { id?: string }).id
			: url === '/api/alerts' && req.method === 'POST'
				? (req.body as { eventId?: string } | undefined)?.eventId
				: undefined;
		if (!id) return;
		const access = eventAccess(db, viewer, id);
		if (access === 'none') return reply.code(404).send({ error: 'Event not found' });
		if (access === 'busy')
			return reply.code(403).send({ error: 'That time is busy for someone else; only they can see it' });
	});
}
