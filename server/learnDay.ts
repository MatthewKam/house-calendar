import type { DB } from './db.ts';
import { localDay } from './stages.ts';

// A kid's Learn day: it opens once their Daily tasks are done (or a grown-up unlocks it; a grown-up can
// lock it too), then they play their games a day (2 unless set), within their time a day if there is
// one, plus whatever extra a grown-up gave today. Whichever runs out first ends the day. A game started
// is always finished. Chomp! (for two) is free: it never counts and is never locked.

/** A grown-up's "more": games, or minutes. */
export const MORE_GAMES = 2;
export const MORE_MINUTES = 15;

interface DayRow {
	extra_games: number;
	extra_minutes: number;
	open: number | null;
	seconds: number;
}
interface TaskRow {
	id: string;
	member_id: string | null;
	days: string;
	created_at: string;
	due_by: string | null;
}

/**
 * Whether a kid has done every Daily task due today (by the same rules as the task bars, lib/tasks.ts:
 * on its weekdays from the day it was added; a one-time one until it's done or its day is past). True
 * when none are due.
 */
export function dailyTasksDone(db: DB, memberId: string, today: string) {
	const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
	const tasks = db
		.prepare(
			`SELECT id, member_id, days, created_at, due_by FROM tasks
    WHERE category = 'non_negotiable' AND (member_id = ? OR member_id IS NULL)`,
		)
		.all(memberId) as TaskRow[];
	const firstDone = db.prepare('SELECT MIN(day) AS day FROM task_done WHERE task_id = ? AND member_id = ?');
	const doneToday = db.prepare('SELECT 1 FROM task_done WHERE task_id = ? AND member_id = ? AND day = ?');
	const due = tasks.filter((t) => {
		if (today < localDay(new Date(t.created_at))) return false;
		if (!t.due_by) return t.days.includes(String(weekday));
		const first = (firstDone.get(t.id, memberId) as { day: string | null }).day;
		return today <= t.due_by && (!first || today <= first);
	});
	return due.every((t) => !!doneToday.get(t.id, memberId, today));
}

/** Today's Learn for a kid: what they've used, what they have, and whether they can start a game. */
export function learnDay(db: DB, memberId: string, today: string) {
	const kid = db.prepare('SELECT games_a_day, minutes_a_day FROM learn_kids WHERE member_id = ?').get(memberId) as
		{ games_a_day: number; minutes_a_day: number | null } | undefined;
	const day = db
		.prepare('SELECT extra_games, extra_minutes, open, seconds FROM learn_days WHERE member_id = ? AND day = ?')
		.get(memberId, today) as DayRow | undefined;
	const played = (
		db.prepare('SELECT COUNT(*) AS n FROM learn_sessions WHERE member_id = ? AND day = ?').get(memberId, today) as {
			n: number;
		}
	).n;
	const games = (kid?.games_a_day ?? 2) + (day?.extra_games ?? 0);
	const minutes = kid?.minutes_a_day == null ? null : kid.minutes_a_day + (day?.extra_minutes ?? 0);
	const seconds = day?.seconds ?? 0;
	const tasksDone = dailyTasksDone(db, memberId, today);
	// Locked or unlocked by a grown-up today, else open once the Daily tasks are done.
	const open = day?.open == null ? tasksDone : day.open === 1;
	const why = !open
		? day?.open === 0
			? 'locked'
			: 'tasks'
		: played >= games
			? 'games'
			: minutes !== null && seconds >= minutes * 60
				? 'time'
				: null;
	return {
		/** The kid's own settings: games a day, and minutes a day (null: no time limit). */
		gamesADay: kid?.games_a_day ?? 2,
		minutesADay: kid?.minutes_a_day ?? null,
		played,
		games,
		seconds,
		minutes,
		/** A grown-up unlocked (true) or locked (false) it today; null: it follows the Daily tasks. */
		unlocked: day?.open == null ? null : day.open === 1,
		tasksDone,
		/** Why they can't start a game now (null: they can): Daily tasks first, locked, games or time used up. */
		why: why as 'tasks' | 'locked' | 'games' | 'time' | null,
	};
}

const ensure = (db: DB, memberId: string, today: string) =>
	db.prepare('INSERT OR IGNORE INTO learn_days (member_id, day) VALUES (?, ?)').run(memberId, today);

/** A grown-up's change to today: unlock or lock it (null: back to following the Daily tasks), or give more. */
export function changeDay(
	db: DB,
	memberId: string,
	today: string,
	change: { open?: boolean | null; moreGames?: boolean; moreMinutes?: boolean },
) {
	db.transaction(() => {
		ensure(db, memberId, today);
		if (change.open !== undefined) {
			db.prepare('UPDATE learn_days SET open = ? WHERE member_id = ? AND day = ?').run(
				change.open === null ? null : change.open ? 1 : 0,
				memberId,
				today,
			);
		}
		// More to play: it's open now, too.
		if (change.moreGames)
			db.prepare('UPDATE learn_days SET extra_games = extra_games + ?, open = 1 WHERE member_id = ? AND day = ?').run(
				MORE_GAMES,
				memberId,
				today,
			);
		if (change.moreMinutes)
			db.prepare(
				'UPDATE learn_days SET extra_minutes = extra_minutes + ?, open = 1 WHERE member_id = ? AND day = ?',
			).run(MORE_MINUTES, memberId, today);
	})();
}

/** Time spent in a game (sent as they play, and when they leave it). */
export function addTime(db: DB, memberId: string, today: string, seconds: number) {
	db.transaction(() => {
		ensure(db, memberId, today);
		db.prepare('UPDATE learn_days SET seconds = seconds + ? WHERE member_id = ? AND day = ?').run(
			seconds,
			memberId,
			today,
		);
	})();
}
