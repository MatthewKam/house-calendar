import { describe, expect, it } from 'vitest';
import { openDb, type DB } from './db.ts';
import { deleteOldHistory } from './retention.ts';
import { bucket } from './rewards.ts';
import { ROW_PUNCHES } from './potty.ts';

const NOW = new Date('2026-12-01T12:00:00Z');
const OLD = '2024-06-01'; // over 2 years before NOW
const NEW = '2026-11-20';

function family() {
	const db = openDb(':memory:');
	db.prepare("INSERT INTO members (id, name, color, birthdate) VALUES ('sam', 'Sam', '#2f6b3a', '2022-01-01')").run();
	db.prepare("INSERT INTO tasks (id, title, days) VALUES ('teeth', 'Brush teeth', '[0,1,2,3,4,5,6]')").run();
	db.prepare(
		"INSERT INTO tasks (id, title, days, due_by) VALUES ('library', 'Library book back', '[]', '2024-06-01')",
	).run();
	const tick = (task: string, day: string, points: number) =>
		db
			.prepare('INSERT INTO task_done (task_id, member_id, day, points) VALUES (?, ?, ?, ?)')
			.run(task, 'sam', day, points);
	tick('teeth', OLD, 2);
	tick('teeth', NEW, 1);
	tick('library', OLD, 3);
	const moment = (id: string, day: string, stars: number) =>
		db
			.prepare("INSERT INTO moments (id, member_id, kind, stars, day) VALUES (?, 'sam', 'helpful', ?, ?)")
			.run(id, stars, day);
	moment('m-old', OLD, 4);
	moment('m-new', NEW, 1);
	// A potty chart finished long ago with a full row (a star), and one still going.
	const card = (id: string, finished: string | null) =>
		db
			.prepare("INSERT INTO potty_cards (id, member_id, started_at, finished_at) VALUES (?, 'sam', ?, ?)")
			.run(id, finished ?? '2026-11-01T00:00:00Z', finished);
	card('old-card', '2024-05-01T00:00:00Z');
	card('this-card', null);
	for (let i = 0; i < ROW_PUNCHES; i++)
		db.prepare(
			"INSERT INTO potty_punches (id, card_id, member_id, step, created_at) VALUES (?, 'old-card', 'sam', 'go', ?)",
		).run(`p${i}`, '2024-04-01T00:00:00Z');
	db.prepare(
		"INSERT INTO potty_punches (id, card_id, member_id, step) VALUES ('now', 'this-card', 'sam', 'sit')",
	).run();
	return db;
}

const count = (db: DB, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('how long activity history is kept', () => {
	it("deletes history over 2 years old, keeping a one-off task's tick and every star the kid earned", () => {
		const db = family();
		const stars = bucket(db, 'sam');
		expect(stars).toBe(2 + 1 + 3 + 4 + 1 + 1);
		const gone = deleteOldHistory(db, NOW);
		// The old everyday tick, the old moment, the old chart (its punches go with it).
		expect(gone).toBe(3);
		expect(db.prepare('SELECT task_id, day FROM task_done ORDER BY task_id').all()).toEqual([
			{ task_id: 'library', day: OLD },
			{ task_id: 'teeth', day: NEW },
		]);
		expect(count(db, 'moments')).toBe(1);
		expect(count(db, 'potty_cards')).toBe(1);
		expect(count(db, 'potty_punches')).toBe(1);
		// Nobody's stars change: what the old history earned is carried forward.
		expect(bucket(db, 'sam')).toBe(stars);
		expect(db.prepare("SELECT carried_stars FROM members WHERE id = 'sam'").get()).toEqual({
			carried_stars: 2 + 4 + 1,
		});
		// Again: nothing more to do, nothing carried twice.
		expect(deleteOldHistory(db, NOW)).toBe(0);
		expect(bucket(db, 'sam')).toBe(stars);
	});
});
