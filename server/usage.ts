import type { FastifyInstance } from 'fastify';
import type { AccountsDB } from './accounts.ts';

// The usage log, for the admin page: counts per household per day (UTC), nothing about any one person.
// - use:<route>  each change the household made that went through ("POST /api/tasks/:id/done"), by the
//   route's pattern, never its ids or what was in it. Who made it isn't kept, a child's taps are counted
//   with everyone else's.
// - active:<kind>  how many of its devices were used that day: user (someone's own sign-in), device (a
//   kid's device added by code), wall.
// Kept about 13 months (USAGE_DAYS); a deleted household's go with it. The privacy page says so.

export const USAGE_DAYS = 400;

const day = (d: Date) => d.toISOString().slice(0, 10);

export type UsageLog = ReturnType<typeof usageLog>;

export function usageLog(accounts: AccountsDB, now = () => new Date()) {
	/** Counts not yet written: `day \n household \n metric` → how many. Written each minute, so a change costs nothing. */
	const pending = new Map<string, number>();
	const add = accounts.prepare(`
		INSERT INTO usage_daily (day, household_id, metric, count) VALUES (?, ?, ?, ?)
		ON CONFLICT (day, household_id, metric) DO UPDATE SET count = count + excluded.count`);
	// A device counts once a day: its sign-in's last use is today. Sign-outs today mustn't lower it.
	const active = accounts.prepare(`
		INSERT INTO usage_daily (day, household_id, metric, count)
		SELECT @day, s.household_id, 'active:' || s.kind, COUNT(*) FROM sessions s
		JOIN households h ON h.id = s.household_id
		WHERE s.last_seen >= @day GROUP BY s.household_id, s.kind
		ON CONFLICT (day, household_id, metric) DO UPDATE SET count = MAX(count, excluded.count)`);

	/** One more of `metric` for the household, today. */
	function count(householdId: string, metric: string) {
		const key = `${day(now())}\n${householdId}\n${metric.slice(0, 120)}`;
		pending.set(key, (pending.get(key) ?? 0) + 1);
	}

	/** Writes what's counted, and today's active devices. Never throws: a count that fails is let go. */
	function flush() {
		const rows = [...pending];
		pending.clear();
		try {
			accounts.transaction(() => {
				for (const [key, n] of rows) {
					const [d, household, metric] = key.split('\n');
					// A household deleted since: its counts go with it.
					if (accounts.prepare('SELECT 1 FROM households WHERE id = ?').get(household))
						add.run(d, household, metric, n);
				}
				active.run({ day: day(now()) });
			})();
		} catch {
			// Counting mustn't break anything.
		}
	}

	/** Days older than about 13 months, deleted. Returns how many rows. */
	function forgetOld() {
		const before = day(new Date(now().getTime() - USAGE_DAYS * 86_400_000));
		return accounts.prepare('DELETE FROM usage_daily WHERE day < ?').run(before).changes;
	}

	let timers: NodeJS.Timeout[] = [];
	return {
		count,
		flush,
		forgetOld,
		/** Writes each minute and forgets old days daily, until stop (which writes what's left). */
		start() {
			forgetOld();
			timers = [setInterval(flush, 60_000), setInterval(forgetOld, 24 * 3_600_000)];
			for (const t of timers) t.unref();
		},
		stop() {
			for (const t of timers) clearInterval(t);
			flush();
		},
	};
}

/** Counts a Fastify app's changes that went through (not looking, not refused), by route pattern. */
export function watchUsage(app: FastifyInstance, count: (metric: string) => void) {
	app.addHook('onResponse', async (req, reply) => {
		if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
		if (reply.statusCode >= 400 || !req.routeOptions.url) return;
		count(`use:${req.method} ${req.routeOptions.url}`);
	});
}
