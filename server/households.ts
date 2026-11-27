import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import type { HouseholdRow } from './accounts.ts';
import type { SyncStatus } from '../shared/calendars.ts';

// Each household runs as its own app (app.ts) on its own database, built the first time someone
// in it signs in, and kept running (its syncs and timers too) until the server stops or it's deleted.

interface HouseholdApp {
	app: FastifyInstance;
	db: DB;
	/** Google Calendar for this household, when it's turned on. */
	google?: {
		connect(c: { memberId: string | null; account: string; refreshToken: string }): void;
		/** Google called about one of its watches (googleWatch.ts); true when it was one of this household's. */
		notified?(channelId: string | undefined, token: string | undefined, state: string | undefined): boolean;
	};
	/** Each Google and iCloud account it syncs, as it stands (for the admin page's server health). */
	syncStatuses?(): SyncStatus[];
	/** Takes out a person's calendar connections (giving back Google's access): their account is being deleted. */
	disconnect?(memberId: string): Promise<void>;
	close(): Promise<void>;
}

export function householdRegistry(make: (h: HouseholdRow) => HouseholdApp) {
	const live = new Map<string, Promise<HouseholdApp>>();
	return {
		get(h: HouseholdRow): Promise<HouseholdApp> {
			let running = live.get(h.id);
			if (!running) {
				running = (async () => {
					const made = make(h);
					await made.app.ready();
					return made;
				})();
				// A failed start is tried again next time.
				running.catch(() => live.delete(h.id));
				live.set(h.id, running);
			}
			return running;
		},
		/** Stops a household that's being deleted (if it's running). */
		async drop(id: string) {
			const running = live.get(id);
			live.delete(id);
			await running?.then((h) => h.close()).catch(() => {});
		},
		/** How many are running. */
		running: () => live.size,
		/** The ones running (those still starting are waited for; one that failed to start is left out). */
		async all(): Promise<HouseholdApp[]> {
			const settled = await Promise.allSettled([...live.values()]);
			return settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
		},
		async closeAll() {
			const all = [...live.values()];
			live.clear();
			await Promise.allSettled(all.map(async (p) => (await p).close()));
		},
	};
}
export type HouseholdRegistry = ReturnType<typeof householdRegistry>;
