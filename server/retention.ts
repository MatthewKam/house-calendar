import type { DB } from './db.ts';
import { localDay } from './stages.ts';
import { earned } from './rewards.ts';

// How long Sprig keeps a family's activity history (the privacy page's "How long we keep it", and
// docs/coppa.md): what's older than HISTORY_DAYS goes, once a day. The rest is kept until the family deletes
// it, and everything about a person goes when they're removed (ON DELETE CASCADE).
//
// A kid's stars are worked out from that history (rewards.ts bucket), so before it goes, the stars it earned
// are carried forward on the kid (members.carried_stars): nobody's stars change.

/** History older than this many days is deleted. */
export const HISTORY_DAYS = 730;
const DAY_MS = 86_400_000;

/**
 * Deletes activity history from before HISTORY_DAYS ago: each day's ticks on everyday (repeating) tasks,
 * moments, learning sessions, and potty charts finished before then. A one-off task's tick stays with it (it's
 * what says it was done). Returns how many rows went.
 */
export function deleteOldHistory(db: DB, now = new Date()) {
	const before = localDay(new Date(now.getTime() - HISTORY_DAYS * DAY_MS));
	const beforeInstant = new Date(now.getTime() - HISTORY_DAYS * DAY_MS).toISOString();
	let gone = 0;
	db.transaction(() => {
		for (const { id } of db.prepare('SELECT id FROM members').all() as { id: string }[]) {
			const had = earned(db, id);
			gone +=
				db
					.prepare(
						`DELETE FROM task_done WHERE member_id = ? AND day < ?
          AND task_id IN (SELECT id FROM tasks WHERE due_by IS NULL)`,
					)
					.run(id, before).changes +
				db.prepare('DELETE FROM moments WHERE member_id = ? AND day < ?').run(id, before).changes +
				db.prepare('DELETE FROM learn_sessions WHERE member_id = ? AND day < ?').run(id, before).changes +
				db
					.prepare('DELETE FROM potty_cards WHERE member_id = ? AND finished_at IS NOT NULL AND finished_at < ?')
					.run(id, beforeInstant).changes;
			const lost = had - earned(db, id);
			if (lost) db.prepare('UPDATE members SET carried_stars = carried_stars + ? WHERE id = ?').run(lost, id);
		}
	})();
	return gone;
}
