import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AccountsDB } from './accounts.ts';

// Crash reports: what went wrong, in the app (on any device, a child's too) or on the server, for the admin
// page. The same crash again adds to its count rather than a new row. Kept only to find and fix problems:
// what broke, where (the page, or the server's route), which build and platform, and which households saw it
// (to tell real families from Sprig's own tests). Never what anyone typed or who they are: emails, long
// secret-looking strings and numbers in ids are masked, and each part is cut short. Gone 90 days after a
// crash was last seen (the privacy page says so).

export const CRASH_DAYS = 90;
/** Different crashes kept at most; past it, new ones are dropped (the ones there still count). */
const MAX_CRASHES = 2000;

export interface CrashReport {
	source: 'app' | 'server';
	message: string;
	stack?: string;
	/** Where: the app's part that broke ("Today", "kid mode") or the server's route ("POST /api/tasks/:id"). */
	place?: string;
	/** web, ios, android, or server. */
	platform?: string;
	/** The app's build. */
	version?: string;
	/** The signed-in device's kind (user, device, wall), when there was one. */
	device?: string;
	householdId?: string | null;
}

/** A report's text, safe to keep: no emails or secret-looking strings, and no longer than `max`. */
export function scrub(text: string | undefined, max: number) {
	if (!text) return '';
	return text
		.replace(/[^\s@'"<>()]+@[^\s@'"<>()]+\.[A-Za-z]{2,}/g, '<email>')
		.replace(/[A-Za-z0-9_-]{32,}/g, '…')
		.slice(0, max);
}

/**
 * The same crash, however often: its source, place and message with numbers and ids made alike, and any
 * build's hashed file names (index-abc123.js) left out.
 */
export function fingerprint(r: Pick<CrashReport, 'source' | 'place' | 'message'>) {
	const message = r.message
		.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
		.replace(/\d+/g, '#');
	return createHash('sha256')
		.update(`${r.source}\n${r.place ?? ''}\n${message}`)
		.digest('hex')
		.slice(0, 32);
}

export type CrashLog = ReturnType<typeof crashLog>;

export function crashLog(accounts: AccountsDB, now = () => new Date()) {
	const upsert = accounts.prepare(`
		INSERT INTO crashes (fingerprint, source, message, stack, place, platform, version, device, first_at, last_at)
		VALUES (@fingerprint, @source, @message, @stack, @place, @platform, @version, @device, @at, @at)
		ON CONFLICT (fingerprint) DO UPDATE SET count = count + 1, last_at = excluded.last_at, stack = excluded.stack,
			platform = excluded.platform, version = excluded.version, device = excluded.device`);
	const seenBy = accounts.prepare(`
		INSERT INTO crash_households (fingerprint, household_id, last_at) VALUES (?, ?, ?)
		ON CONFLICT (fingerprint, household_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at`);

	/** Notes a crash. Never throws: a crash report that fails is let go. */
	function record(r: CrashReport) {
		try {
			const message = scrub(r.message, 500) || 'Unknown error';
			const place = scrub(r.place, 120);
			const row = {
				fingerprint: fingerprint({ source: r.source, place, message }),
				source: r.source,
				message,
				stack: scrub(r.stack, 4000) || null,
				place: place || null,
				platform: scrub(r.platform, 20) || null,
				version: scrub(r.version, 40) || null,
				device: scrub(r.device, 20) || null,
				at: now().toISOString(),
			};
			accounts.transaction(() => {
				const known = accounts.prepare('SELECT 1 FROM crashes WHERE fingerprint = ?').get(row.fingerprint);
				if (!known && (accounts.prepare('SELECT COUNT(*) AS n FROM crashes').get() as { n: number }).n >= MAX_CRASHES)
					return;
				upsert.run(row);
				const household = r.householdId && accounts.prepare('SELECT 1 FROM households WHERE id = ?').get(r.householdId);
				if (household) seenBy.run(row.fingerprint, r.householdId, row.at);
			})();
		} catch {
			// Nothing more to do: reporting a crash mustn't cause another.
		}
	}

	return {
		record,
		/** The server's own: an error while answering a request (any not meant for the caller, 500 and up). */
		server(err: unknown, where: { method?: string; route?: string; householdId?: string | null }) {
			const e = err instanceof Error ? err : new Error(String(err));
			record({
				source: 'server',
				message: `${e.name}: ${e.message}`,
				stack: e.stack,
				place: where.route ? `${where.method ?? ''} ${where.route}`.trim() : undefined,
				platform: 'server',
				householdId: where.householdId,
			});
		},
		/** Crashes last seen over 90 days ago, deleted. Returns how many. */
		forgetOld() {
			const before = new Date(now().getTime() - CRASH_DAYS * 86_400_000).toISOString();
			return accounts.prepare('DELETE FROM crashes WHERE last_at < ?').run(before).changes;
		},
	};
}

/**
 * Reports a Fastify app's errors that are the server's fault (500 and up, or no status: not a refusal like a
 * bad request), with the route's pattern ("/api/tasks/:id", never the ids themselves).
 */
export function watchServerErrors(
	app: FastifyInstance,
	report: (err: Error, where: { method: string; route?: string }) => void,
) {
	app.addHook('onError', async (req, _reply, err) => {
		if ((err as { statusCode?: number }).statusCode && (err as { statusCode: number }).statusCode < 500) return;
		report(err, { method: req.method, route: req.routeOptions.url });
	});
}
