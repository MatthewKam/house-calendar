import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import { syncOnce } from './sync.ts';
import { schemaOf } from './schemas.ts';
import type { CalendarSource, RemoteEvent } from './providers/types.ts';
import { PhoneSync, type Phone, type PhoneEvent } from '../shared/calendars.ts';

// Calendars read from someone's iPhone (the app's PhoneCalendars plugin): no password, the phone just asks
// to see its calendars. The phone sends every calendar the person shares, with their events over the sync
// window, whenever Sprig opens or iOS lets it refresh; each send replaces what that phone sent before,
// through the same snapshot sync as iCloud (sync.ts). They're read-only here: changing one is done on the
// phone. Someone who also connects iCloud with a password (always in step) has their phone's iCloud
// calendars left out, so they don't show twice.

interface PhoneRow {
	id: string;
	member_id: string;
	name: string;
	last_sync: string;
}

/** Where a phone's calendars come from, in calendars.source. */
const sourceKey = (phone: string) => `phone:${phone}`;

export function registerPhoneCalendars(app: FastifyInstance, db: DB, opts: { onAssignmentsChanged?: () => void } = {}) {
	const phone = (id: string) => db.prepare('SELECT * FROM phones WHERE id = ?').get(id) as PhoneRow | undefined;
	const summary = (r: PhoneRow): Phone => ({
		id: r.id,
		memberId: r.member_id,
		name: r.name,
		lastSync: r.last_sync,
		calendars: (db.prepare('SELECT COUNT(*) n FROM calendars WHERE source = ?').get(sourceKey(r.id)) as { n: number })
			.n,
	});

	app.get('/api/phone-calendars', async () =>
		(db.prepare('SELECT * FROM phones ORDER BY name, id').all() as PhoneRow[]).map(summary),
	);

	// A phone's calendars, sent by the person signed in on it.
	// Signed out (a household on its own, or tests) everything is open, and ?member= says whose phone it is.
	app.put<{ Params: { phone: string }; Querystring: { member?: string }; Body: PhoneSync }>(
		'/api/phone-calendars/:phone',
		{ schema: { body: schemaOf(PhoneSync) }, bodyLimit: 8 * 1024 * 1024 },
		async (req, reply) => {
			const memberId = req.raw.viewer ? req.raw.viewer.memberId : req.query.member;
			if (typeof memberId !== 'string' || !memberId) {
				return reply.code(403).send({ error: 'Sign in on this phone to share its calendars' });
			}
			const id = req.params.phone.slice(0, 100);
			const before = phone(id);
			if (before && before.member_id !== memberId) {
				return reply.code(403).send({ error: "That's someone else's phone" });
			}
			// With iCloud connected by password too, that copy is the one kept.
			const viaPassword = db
				.prepare(`SELECT 1 FROM connections WHERE provider = 'icloud' AND member_id = ?`)
				.get(memberId);
			const calendars = req.body.calendars.filter((c) => !(viaPassword && /icloud/i.test(c.account)));
			const result = await syncOnce(db, phoneSource(id, memberId, calendars, req.body.events));
			db.prepare(
				`INSERT INTO phones (id, member_id, name, last_sync) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_sync = excluded.last_sync`,
			).run(id, memberId, req.body.name, new Date().toISOString());
			opts.onAssignmentsChanged?.();
			return { ...summary(phone(id)!), events: result.events };
		},
	);

	// Stops sharing a phone's calendars: its calendars and their events go. The person or a parent.
	app.delete<{ Params: { phone: string } }>('/api/phone-calendars/:phone', async (req, reply) => {
		const row = phone(req.params.phone);
		if (!row) return reply.code(404).send({ error: 'Not found' });
		const viewer = req.raw.viewer;
		if (viewer && !viewer.parent && viewer.memberId !== row.member_id) {
			return reply.code(403).send({ error: "Locked: unlock with a guardian's PIN to change this", locked: true });
		}
		db.transaction(() => {
			db.prepare('DELETE FROM calendars WHERE source = ?').run(sourceKey(row.id));
			db.prepare('DELETE FROM phones WHERE id = ?').run(row.id);
		})();
		return reply.code(204).send();
	});
}

/** What the phone sent, as a calendar source the snapshot sync reads like any other. */
function phoneSource(
	phone: string,
	memberId: string,
	calendars: PhoneSync['calendars'],
	events: PhoneEvent[],
): CalendarSource {
	// A phone's ids are its own: prefixed, so two phones never share one.
	const remote = (calendarId: string) => `${phone}:${calendarId}`;
	return {
		id: 'phone',
		key: sourceKey(phone),
		memberId,
		listCalendars: async () =>
			calendars.map((c) => ({
				remoteId: remote(c.id),
				name: c.name,
				primary: c.primary,
				color: c.color ?? undefined,
				// Changed on the phone, not here.
				writable: false,
			})),
		fetchRange: async (calendarRemoteId) =>
			events.filter((e) => remote(e.calendarId) === calendarRemoteId).map(toRemote),
	};
}

const toRemote = (e: PhoneEvent): RemoteEvent => ({
	remoteId: e.id,
	etag: '',
	title: e.title,
	allDay: e.allDay,
	// Stored as UTC instants, as every other calendar's are.
	start: e.allDay ? e.start : new Date(e.start).toISOString(),
	end: e.allDay ? e.end : new Date(e.end).toISOString(),
	location: e.location?.replace(/\s*\n\s*/g, ', ') || null,
	notes: e.notes || null,
});
