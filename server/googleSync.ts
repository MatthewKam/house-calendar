import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { createSync } from './sync.ts';
import { GoogleSource, type GoogleOAuth } from './providers/google.ts';
import type { Classify } from './people.ts';
import type { Sealer } from './secrets.ts';

// A household's Google connections: one sync per connected account, started when it's connected
// and stopped when it's removed.

type Log = Parameters<ReturnType<typeof createSync>['start']>[0];
interface ConnectionRow { id: string; member_id: string | null; account: string; token: string; created_at: string }

export interface GoogleConnection {
  id: string; account: string; memberId: string | null; connectedAt: string;
  lastSuccess: string | null; lastError: string | null; calendars: number;
}

export function googleCalendars(db: DB, opts: {
  oauth: GoogleOAuth; sealer: Sealer; classify: Classify | null; log: Log; fetchImpl?: typeof fetch; intervalMs?: number;
}) {
  const syncs = new Map<string, ReturnType<typeof createSync>>();
  const rows = () => db.prepare(`SELECT * FROM connections WHERE provider = 'google' ORDER BY created_at`).all() as ConnectionRow[];

  /** Starts a sync for each connection without one, and stops (and clears out) the ones removed. */
  function refresh() {
    const now = rows();
    for (const row of now) {
      if (syncs.has(row.id)) continue;
      let token: string;
      try {
        token = opts.sealer.open(row.token);
      } catch (err) {
        opts.log.error({ err }, `can't read the Google token for ${row.account}`);
        continue;
      }
      const sync = createSync(db, new GoogleSource(`google:${row.id}`, row.member_id, row.account, token, opts.oauth, opts.fetchImpl),
        opts.classify, opts.intervalMs);
      sync.start(opts.log);
      syncs.set(row.id, sync);
    }
    for (const [id, sync] of syncs) {
      if (now.some((r) => r.id === id)) continue;
      sync.stop();
      syncs.delete(id);
    }
    // Calendars from accounts no longer connected go, with their events.
    db.prepare(`DELETE FROM calendars WHERE source LIKE 'google:%' AND source NOT IN (SELECT 'google:' || id FROM connections)`).run();
  }

  return {
    refresh,
    /** A person connected (or reconnected) their Google account. */
    connect(c: { memberId: string | null; account: string; refreshToken: string }) {
      const existing = db.prepare(`SELECT id FROM connections WHERE provider = 'google' AND account = ?`).get(c.account) as { id: string } | undefined;
      if (existing) {
        db.prepare('UPDATE connections SET token = ?, member_id = COALESCE(?, member_id) WHERE id = ?').run(opts.sealer.seal(c.refreshToken), c.memberId, existing.id);
        // Its sync starts over with the new token.
        syncs.get(existing.id)?.stop();
        syncs.delete(existing.id);
      } else {
        db.prepare(`INSERT INTO connections (id, provider, member_id, account, token) VALUES (?, 'google', ?, ?, ?)`)
          .run(randomUUID(), c.memberId, c.account, opts.sealer.seal(c.refreshToken));
      }
      refresh();
    },
    async remove(id: string) {
      const row = db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as ConnectionRow | undefined;
      if (!row) return false;
      db.prepare('DELETE FROM connections WHERE id = ?').run(id);
      refresh();
      // Tells Google too, so the app no longer has access.
      try {
        await opts.oauth.revoke(opts.sealer.open(row.token));
      } catch { /* already gone */ }
      return true;
    },
    list(): GoogleConnection[] {
      return rows().map((r) => {
        const st = syncs.get(r.id)?.status;
        return {
          id: r.id, account: r.account, memberId: r.member_id, connectedAt: r.created_at,
          lastSuccess: st?.lastSuccess ?? null, lastError: st?.lastError ?? null, calendars: st?.calendars ?? 0,
        };
      });
    },
    statuses: () => [...syncs.values()].map((s) => s.status),
    assignPeople: () => Promise.all([...syncs.values()].map((s) => s.assignPeople())),
    stop() {
      for (const s of syncs.values()) s.stop();
      syncs.clear();
    },
  };
}
export type GoogleCalendars = ReturnType<typeof googleCalendars>;
