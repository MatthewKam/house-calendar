import type { DB } from './db.ts';
import { GoogleSource, type GoogleOAuth } from './providers/google.ts';
import { calendarConnections, type Connection, type ConnectionOptions } from './connections.ts';
import { googleWatches } from './googleWatch.ts';

// A household's Google connections: each person's Google account, kept with its refresh token.
// With `notifyAddress` (the server's own https address for this household), Google also tells Sprig the
// moment a calendar changes (googleWatch.ts); without one (while developing), the 5-minute pass alone.

export type GoogleConnection = Connection;

export function googleCalendars(
	db: DB,
	opts: ConnectionOptions & { oauth: GoogleOAuth; fetchImpl?: typeof fetch; notifyAddress?: string },
) {
	const watches = opts.notifyAddress ? googleWatches(db, { address: opts.notifyAddress, log: opts.log }) : null;
	const conns = calendarConnections(db, 'google', {
		...opts,
		source: (c) => new GoogleSource(c.key, c.memberId, c.account, c.secret, opts.oauth, opts.fetchImpl),
		revoke: (token) => opts.oauth.revoke(token),
		...(watches && {
			afterSync: (key, source) => watches.renew(key, source as GoogleSource),
			beforeRemove: (key, source) => watches.stopAll(key, source as GoogleSource),
		}),
	});
	return {
		...conns,
		refresh() {
			conns.refresh();
			watches?.clearGone();
		},
		connect: (c: { memberId: string | null; account: string; refreshToken: string }) =>
			conns.connect({ memberId: c.memberId, account: c.account, secret: c.refreshToken }),
		/**
		 * Google called about a watch (hosted.ts): its channel id and token. A real one syncs that account in
		 * a moment; 'sync' is Google saying a new watch has started, with nothing changed yet.
		 */
		notified(channelId: string | undefined, token: string | undefined, state: string | undefined) {
			const source = watches?.check(channelId, token);
			if (!source) return false;
			if (state !== 'sync') conns.changed(source);
			return true;
		},
	};
}
export type GoogleCalendars = ReturnType<typeof googleCalendars>;
