import type { FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import type { Viewer } from './auth.ts';
import type { DB } from './db.ts';

// Shopping together, for a list (lists.ts) or a recipe's ingredients (recipeShopping.ts): who's
// shopping from what, until when, and the live answer their phones keep asking for while they are,
// which comes back as soon as anything changes (a tick on the other phone) instead of every 30 seconds.
// Kept in the database, so a restart of the server mid-shop doesn't end it.

/** How long Shopping together stays on without being turned on again: a trip to the shops, at most. */
export const SHOPPING_MS = 2 * 60 * 60 * 1000;

/** How long a live answer waits for a change before answering anyway (under the app's 30-second limit), and how often it looks. */
export type LiveTimes = { waitMs: number; lookMs: number };
export const LIVE_TIMES: LiveTimes = { waitMs: 20_000, lookMs: 1_000 };

/** The member asking (a guardian or kid, or whose PIN unlocked the device), if they're in this family. */
export function memberAsking(db: DB, viewer: Viewer | undefined) {
	const id = viewer?.memberId ?? viewer?.actor ?? null;
	return id && db.prepare('SELECT 1 FROM members WHERE id = ?').get(id) ? id : null;
}

/**
 * Who's shopping from it now (`list:…` or `recipe:…`): members' ids, null for a device with no one
 * signed in. Anyone whose time ran out is forgotten first.
 */
export function shoppersOf(db: DB, target: string): (string | null)[] {
	db.prepare('DELETE FROM shopping WHERE until <= ?').run(Date.now());
	// In the order they started; two starting in the same millisecond, by which was saved first.
	const rows = db.prepare('SELECT member_id FROM shopping WHERE target = ? ORDER BY until, rowid').all(target) as {
		member_id: string;
	}[];
	// '' in the table (a key can't be null): no one in particular.
	return rows.map((r) => r.member_id || null);
}

/** Shopping from it, for SHOPPING_MS from now (on), or not any more (off). */
export function setShopping(db: DB, target: string, who: string | null, on: boolean) {
	if (on)
		db.prepare('INSERT OR REPLACE INTO shopping (target, member_id, until) VALUES (?, ?, ?)').run(
			target,
			who ?? '',
			Date.now() + SHOPPING_MS,
		);
	else db.prepare('DELETE FROM shopping WHERE target = ? AND member_id = ?').run(target, who ?? '');
}

/** A stamp of how something is now: it changes when anything in it does. */
const stampOf = (value: unknown) => createHash('sha1').update(JSON.stringify(value)).digest('hex');

/**
 * The live answer: `read()` as soon as it's not as the stamp says (straight away if it already isn't),
 * or as it is once the wait is over, with its stamp to ask with next time.
 */
export async function liveAnswer<T>(
	read: () => T,
	since: string | undefined,
	reply: FastifyReply,
	times: LiveTimes,
): Promise<{ stamp: string; value: T }> {
	const until = Date.now() + times.waitMs;
	let gone = false;
	// The phone stopped asking (left the page, lost the signal): no answer to wait for.
	reply.raw.on('close', () => (gone = true));
	for (;;) {
		const value = read();
		const stamp = stampOf(value);
		if (stamp !== since || Date.now() >= until || gone) return { stamp, value };
		await new Promise((done) => setTimeout(done, times.lookMs));
	}
}
