import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import { applyPeople } from './people.ts';
import { memberExists, schemaOf } from './schemas.ts';
import {
	CalendarPatch,
	ICloudSignIn,
	type Connection,
	type Connections,
	type SyncedCalendar,
	type SyncStatus,
	type Visibility,
} from '../shared/calendars.ts';
import { localDay } from './stages.ts';

// Synced calendars (who each is for, whether it shows, who sees its events), how syncing is going,
// and the calendar accounts behind them: Google (connected on the front server) and iCloud (here).

/** Sends wall edits to iCloud and Google: after the Undo window (soon), or straight away (now). */
export interface SyncedEdits {
	soon: () => void;
	now?: () => void;
}

export interface CalendarOptions {
	/** Calendar sync status: one, or worked out on each call when accounts come and go. */
	sync?: SyncStatus | (() => SyncStatus | null);
	/** People's Google Calendar connections; without it, Google Calendar is off. */
	google?: { list(): Connection[]; remove(id: string): Promise<boolean> };
	/** People's iCloud connections, made here with an Apple ID and app-specific password. */
	icloud?: {
		list(): Connection[];
		remove(id: string): Promise<boolean>;
		/** Throws ICloudLoginError when iCloud doesn't accept them. */
		connect(c: { memberId: string | null; appleId: string; password: string }): Promise<void>;
	};
	/** Present when new events can be added to synced calendars (iCloud). */
	syncedEdits?: SyncedEdits;
	/** Someone opened Sprig: sync the calendar accounts now (each at most every 30 seconds). */
	syncNow?: () => Promise<void>;
	/** A calendar link changed, so Claude can sort what is now unassigned. */
	onAssignmentsChanged?: () => void;
}

interface CalendarRow {
	id: string;
	provider: 'icloud' | 'google';
	name: string;
	color: string | null;
	member_id: string | null;
	hidden: number;
	writable: number;
	visibility: Visibility;
}

export function registerCalendars(app: FastifyInstance, db: DB, opts: CalendarOptions) {
	const calendarSummary = (c: CalendarRow): SyncedCalendar => ({
		id: c.id,
		provider: c.provider,
		name: c.name,
		color: c.color,
		memberId: c.member_id,
		hidden: c.hidden === 1,
		// Who sees its events, unless an event says otherwise (privacy.ts).
		visibility: c.visibility,
		// New events can be added to it from the wall.
		writable: c.writable === 1 && !!opts.syncedEdits,
		events: (
			db.prepare('SELECT COUNT(DISTINCT series_id) n FROM events WHERE calendar_id = ?').get(c.id) as { n: number }
		).n,
		// A few upcoming titles (from today at home), to tell same-named calendars apart.
		sample: (
			db
				.prepare(
					`SELECT title FROM events WHERE calendar_id = ? AND end >= ?
                         GROUP BY series_id ORDER BY MIN(start) LIMIT 3`,
				)
				.all(c.id, localDay()) as { title: string }[]
		).map((r) => r.title),
	});

	app.get('/api/calendars', async () =>
		(db.prepare("SELECT * FROM calendars WHERE provider != 'local' ORDER BY name, id").all() as CalendarRow[]).map(
			calendarSummary,
		),
	);

	app.patch<{ Params: { id: string }; Body: CalendarPatch }>(
		'/api/calendars/:id',
		{ schema: { body: schemaOf(CalendarPatch, { minProperties: 1 }) } },
		async (req, reply) => {
			const row = db.prepare("SELECT * FROM calendars WHERE id = ? AND provider != 'local'").get(req.params.id) as
				CalendarRow | undefined;
			if (!row) return reply.code(404).send({ error: 'Calendar not found' });
			const { memberId = row.member_id, hidden = row.hidden === 1, visibility = row.visibility } = req.body;
			if (memberId && !memberExists(db, memberId)) return reply.code(400).send({ error: 'Unknown member' });
			db.transaction(() => {
				db.prepare('UPDATE calendars SET member_id = ?, hidden = ?, visibility = ? WHERE id = ?').run(
					memberId,
					hidden ? 1 : 0,
					visibility,
					row.id,
				);
				applyPeople(db, row.id);
			})();
			// Unlinking or showing a calendar can leave events for Claude to sort.
			opts.onAssignmentsChanged?.();
			return calendarSummary(db.prepare('SELECT * FROM calendars WHERE id = ?').get(row.id) as CalendarRow);
		},
	);

	// ---- Calendar sync status (null when no account is set up) --------------
	app.get('/api/sync', async () => (typeof opts.sync === 'function' ? opts.sync() : opts.sync) ?? null);
	// Opening Sprig (or coming back to it) reads Google and iCloud now, so a change made there shows
	// without waiting for the next 5-minute pass. Answers once that's done, or after 10 seconds anyway.
	app.post('/api/sync', async () => {
		const done = opts.syncNow?.().catch(() => {});
		await Promise.race([done, new Promise((r) => setTimeout(r, 10_000).unref())]);
		return { ok: true };
	});

	// ---- Calendar connections: Google (connecting is on the front server: /api/account/google/connect)
	// and iCloud (connected here).
	app.get('/api/connections', async (): Promise<Connections> => ({
		google: opts.google ? opts.google.list() : null,
		icloud: opts.icloud ? opts.icloud.list() : null,
	}));

	// The person connecting is whoever is signed in; a wall unlocked by a parent connects it for no one.
	app.post<{ Body: ICloudSignIn }>(
		'/api/connections/icloud',
		{ schema: { body: schemaOf(ICloudSignIn) } },
		async (req, reply) => {
			if (!opts.icloud) return reply.code(404).send({ error: 'Not found' });
			try {
				await opts.icloud.connect({
					memberId: req.raw.viewer?.memberId ?? null,
					appleId: req.body.appleId,
					password: req.body.password,
				});
			} catch (err) {
				if (err instanceof Error && err.name === 'ICloudLoginError')
					return reply.code(400).send({ error: err.message });
				req.log.error({ err }, 'connecting iCloud failed');
				return reply.code(502).send({ error: "Couldn't reach iCloud. Try again in a minute." });
			}
			return reply.code(204).send();
		},
	);

	// Removing a connection: the person who connected it, or a parent.
	app.delete<{ Params: { id: string } }>('/api/connections/:id', async (req, reply) => {
		const kind = [opts.google, opts.icloud].find((k) => k?.list().some((c) => c.id === req.params.id));
		const row = kind?.list().find((c) => c.id === req.params.id);
		if (!kind || !row) return reply.code(404).send({ error: 'Not found' });
		const viewer = req.raw.viewer;
		if (viewer && !viewer.parent && viewer.memberId !== row.memberId) {
			return reply.code(403).send({ error: "Locked: unlock with a guardian's PIN to change this", locked: true });
		}
		await kind.remove(row.id);
		return reply.code(204).send();
	});
}
