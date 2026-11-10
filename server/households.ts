import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import type { HouseholdRow } from './accounts.ts';

// Each household runs as its own app (app.ts) on its own database, built the first time someone
// in it signs in, and kept running (its syncs and timers too) until the server stops.

interface HouseholdApp {
  app: FastifyInstance;
  db: DB;
  /** Google Calendar for this household, when it's turned on. */
  google?: { connect(c: { memberId: string | null; account: string; refreshToken: string }): void };
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
    async closeAll() {
      const all = [...live.values()];
      live.clear();
      await Promise.allSettled(all.map(async (p) => (await p).close()));
    },
  };
}
export type HouseholdRegistry = ReturnType<typeof householdRegistry>;
