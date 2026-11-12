import type { DB } from './db.ts';
import { CalDavAuthError } from './providers/caldav.ts';
import { ICloudSource } from './providers/icloud.ts';
import { calendarConnections, type ConnectionOptions } from './connections.ts';

// A household's iCloud connections: each person's Apple ID with an app-specific password they make
// at account.apple.com. Events sync both ways, like the .env iCloud setup.

/** The Apple ID or password was wrong: the person checks them and tries again. */
export class ICloudLoginError extends Error {
	override name = 'ICloudLoginError';
}

export function icloudCalendars(db: DB, opts: ConnectionOptions & { fetchImpl?: typeof fetch }) {
	const make = (appleId: string, password: string, key?: string, memberId?: string | null) =>
		new ICloudSource(appleId, password, opts.fetchImpl, key, memberId);
	const conns = calendarConnections(db, 'icloud', {
		...opts,
		source: (c) => make(c.account, c.secret, c.key, c.memberId),
	});
	return {
		...conns,
		/** Checks the Apple ID and password with iCloud before keeping them. */
		async connect(c: { memberId: string | null; appleId: string; password: string }) {
			const appleId = c.appleId.trim().toLowerCase();
			// Pasted app-specific passwords (xxxx-xxxx-xxxx-xxxx) can pick up spaces.
			const password = c.password.replace(/\s+/g, '');
			try {
				await make(appleId, password).listCalendars();
			} catch (err) {
				if (err instanceof CalDavAuthError) {
					throw new ICloudLoginError("iCloud didn't accept that Apple ID and app-specific password");
				}
				throw err;
			}
			conns.connect({ memberId: c.memberId, account: appleId, secret: password });
		},
	};
}
export type ICloudCalendars = ReturnType<typeof icloudCalendars>;
