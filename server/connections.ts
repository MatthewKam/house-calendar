import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { createSync } from './sync.ts';
import type { CalendarSource, CalendarWriter } from './providers/types.ts';
import type { Classify } from './people.ts';
import type { Sealer } from './secrets.ts';

// A household's calendar accounts of one kind (Google, iCloud): one sync per connected account,
// started when it's connected and stopped when it's removed. The secret that reads the account (a
// Google refresh token, an iCloud app-specific password) is stored encrypted.

type Log = Parameters<ReturnType<typeof createSync>['start']>[0];
interface ConnectionRow {
	id: string;
	member_id: string | null;
	account: string;
	token: string;
	created_at: string;
}

export interface Connection {
	id: string;
	account: string;
	memberId: string | null;
	connectedAt: string;
	lastSuccess: string | null;
	lastError: string | null;
	calendars: number;
}

export interface ConnectionOptions {
	sealer: Sealer;
	classify: Classify | null;
	log: Log;
	intervalMs?: number;
}

export function calendarConnections(
	db: DB,
	provider: 'google' | 'icloud',
	opts: ConnectionOptions & {
		/** The account's calendars, read (and written, if it can) with its secret. `key`: its calendars' source. */
		source(c: {
			key: string;
			memberId: string | null;
			account: string;
			secret: string;
		}): CalendarSource & Partial<CalendarWriter>;
		/** Tells the provider the app no longer has access, when it's removed. */
		revoke?(secret: string): Promise<void>;
	},
) {
	const syncs = new Map<string, ReturnType<typeof createSync>>();
	const rows = () =>
		db.prepare(`SELECT * FROM connections WHERE provider = ? ORDER BY created_at`).all(provider) as ConnectionRow[];

	/** Starts a sync for each connection without one, and stops (and clears out) the ones removed. */
	function refresh() {
		const now = rows();
		for (const row of now) {
			if (syncs.has(row.id)) continue;
			let secret: string;
			try {
				secret = opts.sealer.open(row.token);
			} catch (err) {
				opts.log.error({ err }, `can't read the ${provider} secret for ${row.account}`);
				continue;
			}
			const source = opts.source({
				key: `${provider}:${row.id}`,
				memberId: row.member_id,
				account: row.account,
				secret,
			});
			const sync = createSync(db, source, opts.classify, opts.intervalMs);
			sync.start(opts.log);
			syncs.set(row.id, sync);
		}
		for (const [id, sync] of syncs) {
			if (now.some((r) => r.id === id)) continue;
			sync.stop();
			syncs.delete(id);
		}
		// Calendars from accounts no longer connected go, with their events.
		db.prepare(
			`DELETE FROM calendars WHERE source LIKE ? AND source NOT IN (SELECT provider || ':' || id FROM connections)`,
		).run(`${provider}:%`);
	}

	return {
		refresh,
		/** A person connected (or reconnected) an account. */
		connect(c: { memberId: string | null; account: string; secret: string }) {
			const existing = db
				.prepare(`SELECT id FROM connections WHERE provider = ? AND account = ?`)
				.get(provider, c.account) as { id: string } | undefined;
			if (existing) {
				db.prepare('UPDATE connections SET token = ?, member_id = COALESCE(?, member_id) WHERE id = ?').run(
					opts.sealer.seal(c.secret),
					c.memberId,
					existing.id,
				);
				// Its sync starts over with the new secret.
				syncs.get(existing.id)?.stop();
				syncs.delete(existing.id);
			} else {
				db.prepare(`INSERT INTO connections (id, provider, member_id, account, token) VALUES (?, ?, ?, ?, ?)`).run(
					randomUUID(),
					provider,
					c.memberId,
					c.account,
					opts.sealer.seal(c.secret),
				);
			}
			refresh();
		},
		async remove(id: string) {
			const row = db.prepare('SELECT * FROM connections WHERE id = ? AND provider = ?').get(id, provider) as
				ConnectionRow | undefined;
			if (!row) return false;
			db.prepare('DELETE FROM connections WHERE id = ?').run(id);
			refresh();
			try {
				await opts.revoke?.(opts.sealer.open(row.token));
			} catch {
				/* already gone */
			}
			return true;
		},
		list(): Connection[] {
			return rows().map((r) => {
				const st = syncs.get(r.id)?.status;
				return {
					id: r.id,
					account: r.account,
					memberId: r.member_id,
					connectedAt: r.created_at,
					lastSuccess: st?.lastSuccess ?? null,
					lastError: st?.lastError ?? null,
					calendars: st?.calendars ?? 0,
				};
			});
		},
		statuses: () => [...syncs.values()].map((s) => s.status),
		assignPeople: () => Promise.all([...syncs.values()].map((s) => s.assignPeople())),
		/** Sends new edits to the accounts that take them, once their Undo window has passed. */
		soon() {
			for (const s of syncs.values()) if (s.canWrite) s.soon();
		},
		stop() {
			for (const s of syncs.values()) s.stop();
			syncs.clear();
		},
	};
}
