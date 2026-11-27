import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DB } from './db.ts';

// Google tells Sprig the moment a calendar changes: each synced Google calendar has a watch (Google's
// "channel"), and Google calls `address` (POST /api/google/notify/<household>, hosted.ts) when its events
// change. Sprig then syncs that account straight away, instead of at the next 5-minute pass. The call says
// nothing about the change; it only carries the channel's id and the secret token given with it.
//
// Watches end after about a week: each sync that goes through renews the ones with less than a day left,
// watches calendars new to the account, and stops those for calendars that went. Disconnecting an account
// stops its watches first. The 5-minute pass carries on regardless, so a missed call costs only time.

/** How long a watch is asked for (Google may give less). */
export const WATCH_SECONDS = 7 * 24 * 3600;
/** A watch with less than this left is renewed. */
export const RENEW_WITHIN_MS = 24 * 3_600_000;
/** A calendar Google won't watch (holidays, say) is asked again after this long. */
export const UNSUPPORTED_RETRY_MS = 24 * 3_600_000;

/** What a watch needs from the account's Google source (providers/google.ts). */
export interface Watcher {
	watch(
		calendar: string,
		channel: { id: string; token: string; address: string; ttlSeconds: number },
	): Promise<{ resourceId: string; expiresAt: number } | null>;
	unwatch(channelId: string, resourceId: string): Promise<void>;
}

interface WatchRow {
	channel_id: string;
	source: string;
	calendar: string;
	token: string;
	resource_id: string | null;
	expires_at: string;
}

interface Log {
	error: (o: object, m: string) => void;
}

export function googleWatches(db: DB, opts: { address: string; log: Log; now?: () => number }) {
	const now = opts.now ?? Date.now;
	const rowsOf = (source: string) =>
		db.prepare('SELECT * FROM google_watches WHERE source = ?').all(source) as WatchRow[];
	const drop = db.prepare('DELETE FROM google_watches WHERE channel_id = ?');

	/** Stops one watch with Google (if it has one there) and forgets it; failures are only logged. */
	async function stop(watcher: Watcher, row: WatchRow) {
		drop.run(row.channel_id);
		if (!row.resource_id) return;
		await watcher
			.unwatch(row.channel_id, row.resource_id)
			.catch((err: unknown) => opts.log.error({ err }, `stopping Google's watch on ${row.calendar} failed`));
	}

	return {
		/**
		 * After a sync of `source` (google:<connection>): a watch on each of its calendars, renewing any
		 * near their end (the new one first, then the old stopped, so no change falls between), and stopping
		 * those on calendars no longer there.
		 */
		async renew(source: string, watcher: Watcher) {
			const calendars = (
				db.prepare('SELECT remote_id FROM calendars WHERE source = ?').all(source) as { remote_id: string }[]
			).map((c) => c.remote_id);
			const rows = rowsOf(source);
			for (const row of rows) if (!calendars.includes(row.calendar)) await stop(watcher, row);
			for (const calendar of calendars) {
				const old = rows.find((r) => r.calendar === calendar);
				if (old && Date.parse(old.expires_at) - now() > (old.resource_id ? RENEW_WITHIN_MS : 0)) continue;
				const channel = { id: randomUUID(), token: randomBytes(24).toString('base64url') };
				let made: Awaited<ReturnType<Watcher['watch']>>;
				try {
					made = await watcher.watch(calendar, { ...channel, address: opts.address, ttlSeconds: WATCH_SECONDS });
				} catch (err) {
					opts.log.error({ err }, `Google wouldn't watch ${calendar}`);
					continue;
				}
				db.prepare(
					'INSERT INTO google_watches (channel_id, source, calendar, token, resource_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
				).run(
					channel.id,
					source,
					calendar,
					channel.token,
					made?.resourceId ?? null,
					new Date(made ? made.expiresAt : now() + UNSUPPORTED_RETRY_MS).toISOString(),
				);
				if (old) await stop(watcher, old);
			}
		},
		/** An account is being disconnected: its watches end (before Google's access is given back). */
		async stopAll(source: string, watcher: Watcher) {
			for (const row of rowsOf(source)) await stop(watcher, row);
		},
		/** Forgets the watches of accounts no longer connected (their access is gone, so they'll lapse). */
		clearGone() {
			db.prepare(
				`DELETE FROM google_watches WHERE source NOT IN (SELECT provider || ':' || id FROM connections)`,
			).run();
		},
		/**
		 * Google called: the account (source) whose calendar changed, when the channel is one of Sprig's
		 * live watches and the token is the one it was given; otherwise null, and the call is ignored.
		 */
		check(channelId: string | undefined, token: string | undefined): string | null {
			if (!channelId || !token) return null;
			const row = db.prepare('SELECT * FROM google_watches WHERE channel_id = ?').get(channelId) as
				WatchRow | undefined;
			if (!row?.resource_id) return null;
			const [a, b] = [Buffer.from(row.token), Buffer.from(token)];
			return a.length === b.length && timingSafeEqual(a, b) ? row.source : null;
		},
	};
}
export type GoogleWatches = ReturnType<typeof googleWatches>;
