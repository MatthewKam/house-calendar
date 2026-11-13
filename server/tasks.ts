import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { memberExists, noneOrMember, schemaOf } from './schemas.ts';
import { bucket, coverShortfall } from './rewards.ts';
import { localDay } from './stages.ts';
import {
	TaskDoneParams,
	TaskDoneRange,
	TaskInput,
	TaskOrder,
	TaskPatch,
	type Task,
	type TaskCategory,
	type TaskDone,
	type TaskTime,
} from '../shared/tasks.ts';
import type { z } from 'zod';

/** Goals on a kid's list at once, counting ones for everyone. */
export const MAX_GOALS = 5;
interface TaskRow {
	id: string;
	title: string;
	member_id: string | null;
	days: string;
	sort_order: number;
	created_at: string;
	time: TaskTime | null;
	category: TaskCategory;
	required: number;
	points: number;
	icon: string | null;
	due_by: string | null;
}
/** Tasks are always required; goals never are, and only goals carry points. */
function rules(category: TaskCategory, points: number) {
	const req = category !== 'bonus';
	return { required: req, points: req ? 0 : points };
}

/** `doneOn`: for a one-time task, the day each person did it (it's off their list after that day). */
const toTask = (r: TaskRow, doneOn: Record<string, string> = {}): Task => ({
	id: r.id,
	title: r.title,
	memberId: r.member_id,
	sortOrder: r.sort_order,
	createdAt: r.created_at,
	days: [...r.days].map(Number),
	time: r.time,
	category: r.category,
	required: r.required === 1,
	points: r.points,
	icon: r.icon,
	dueBy: r.due_by,
	doneOn,
});
/** A one-time task is on the list every day until it's done, so its weekdays are all of them. */
const ALL_DAYS = '0123456';
const daysText = (days: number[]) => [...new Set(days)].sort().join('');

export function registerTasks(app: FastifyInstance, db: DB) {
	const GOALS_FULL = `That's ${MAX_GOALS} goals already. Remove one to add another.`;
	/**
	 * Whether one more goal for `memberId` (null: everyone) would be over MAX_GOALS on someone's list,
	 * not counting `except` (the goal being changed) or one-time goals that are over.
	 */
	function tooManyGoals(memberId: string | null, except = '') {
		const count = (m: string) =>
			(
				db
					.prepare(
						`SELECT COUNT(*) n FROM tasks WHERE required = 0 AND id != ?
      AND (member_id = ? OR member_id IS NULL) AND (due_by IS NULL OR due_by >= ?)`,
					)
					.get(except, m, localDay()) as { n: number }
			).n;
		const ids = memberId
			? [memberId]
			: (db.prepare('SELECT id FROM members').all() as { id: string }[]).map((r) => r.id);
		return ids.some((m) => count(m) >= MAX_GOALS);
	}

	const get = (id: string) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;

	/** Every task in order, each one-time task with when each person first did it. */
	function listTasks() {
		const doneOn = new Map<string, Record<string, string>>();
		for (const d of db
			.prepare(
				`SELECT d.task_id, d.member_id, MIN(d.day) AS day FROM task_done d
      JOIN tasks t ON t.id = d.task_id WHERE t.due_by IS NOT NULL GROUP BY d.task_id, d.member_id`,
			)
			.all() as { task_id: string; member_id: string; day: string }[]) {
			doneOn.set(d.task_id, { ...doneOn.get(d.task_id), [d.member_id]: d.day });
		}
		return (db.prepare('SELECT * FROM tasks ORDER BY sort_order, created_at').all() as TaskRow[]).map((r) =>
			toTask(r, doneOn.get(r.id)),
		);
	}

	app.get('/api/tasks', async () => listTasks());

	app.post<{ Body: TaskInput }>(
		'/api/tasks',
		{
			schema: { body: schemaOf(TaskInput) },
		},
		async (req, reply) => {
			if (!noneOrMember(db, req.body.memberId)) return reply.code(400).send({ error: 'Unknown member' });
			const id = randomUUID();
			const next = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM tasks').get() as { n: number }).n;
			const { category, dueBy } = req.body;
			const r = rules(category, req.body.points);
			if (!r.required && tooManyGoals(req.body.memberId)) return reply.code(409).send({ error: GOALS_FULL });
			db.prepare(
				`INSERT INTO tasks (id, title, member_id, days, sort_order, time, category, required, points, icon, due_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				id,
				req.body.title.trim(),
				req.body.memberId,
				dueBy ? ALL_DAYS : daysText(req.body.days),
				next,
				req.body.time,
				category,
				r.required ? 1 : 0,
				r.points,
				req.body.icon || null,
				dueBy,
			);
			reply.code(201);
			return toTask(get(id)!);
		},
	);

	app.patch<{ Params: { id: string }; Body: TaskPatch }>(
		'/api/tasks/:id',
		{
			schema: { body: schemaOf(TaskPatch, { minProperties: 1 }) },
		},
		async (req, reply) => {
			const row = get(req.params.id);
			if (!row) return reply.code(404).send({ error: 'Task not found' });
			const title = req.body.title ?? row.title;
			const memberId = req.body.memberId === undefined ? row.member_id : req.body.memberId;
			if (!noneOrMember(db, memberId)) return reply.code(400).send({ error: 'Unknown member' });
			const dueBy = req.body.dueBy === undefined ? row.due_by : req.body.dueBy;
			const days = dueBy ? ALL_DAYS : req.body.days ? daysText(req.body.days) : row.days;
			const time = req.body.time === undefined ? row.time : req.body.time;
			const icon = req.body.icon === undefined ? row.icon : req.body.icon || null;
			const category = req.body.category ?? row.category;
			const r = rules(category, req.body.points ?? row.points);
			if (!r.required && tooManyGoals(memberId, row.id)) return reply.code(409).send({ error: GOALS_FULL });
			db.transaction(() => {
				db.prepare(
					'UPDATE tasks SET title = ?, member_id = ?, days = ?, time = ?, category = ?, required = ?, points = ?, icon = ?, due_by = ? WHERE id = ?',
				).run(title.trim(), memberId, days, time, category, r.required ? 1 : 0, r.points, icon, dueBy, row.id);
				// Moved to one person: other people's ticks no longer belong to this task.
				if (memberId) db.prepare('DELETE FROM task_done WHERE task_id = ? AND member_id != ?').run(row.id, memberId);
			})();
			return toTask(get(row.id)!);
		},
	);

	app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
		// Whoever earned stars from it; if some of those are already in jars, they come back out of them.
		const earners = (
			db.prepare('SELECT DISTINCT member_id FROM task_done WHERE task_id = ? AND points > 0').all(req.params.id) as {
				member_id: string;
			}[]
		).map((r) => r.member_id);
		const res = db.transaction(() => {
			const res = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
			earners.forEach((m) => coverShortfall(db, m));
			return res;
		})();
		if (res.changes === 0) return reply.code(404).send({ error: 'Task not found' });
		return reply.code(204).send();
	});

	// Check-offs between two local days, end exclusive.
	app.get<{ Querystring: z.infer<typeof TaskDoneRange> }>(
		'/api/tasks/done',
		{ schema: { querystring: schemaOf(TaskDoneRange) } },
		async (req): Promise<TaskDone[]> =>
			(
				db
					.prepare('SELECT task_id, member_id, day, points FROM task_done WHERE day >= ? AND day < ? ORDER BY day')
					.all(req.query.from, req.query.to) as { task_id: string; member_id: string; day: string; points: number }[]
			).map((r) => ({ taskId: r.task_id, memberId: r.member_id, day: r.day, points: r.points })),
	);

	// New order for tasks: ids in the order they should be listed. Others keep their place after them.
	app.put<{ Body: z.infer<typeof TaskOrder> }>(
		'/api/tasks/order',
		{ schema: { body: schemaOf(TaskOrder) } },
		async (req) => {
			const rest = (db.prepare('SELECT id FROM tasks ORDER BY sort_order, created_at').all() as { id: string }[])
				.map((r) => r.id)
				.filter((id) => !req.body.ids.includes(id));
			const set = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');
			db.transaction(() => [...req.body.ids, ...rest].forEach((id, i) => set.run(i, id)))();
			return listTasks();
		},
	);

	// Check off (PUT) or un-check (DELETE) a task for one person on one day. Both are safe to repeat.
	type DoneParams = z.infer<typeof TaskDoneParams>;
	const doneParams = schemaOf(TaskDoneParams);
	app.put<{ Params: DoneParams }>(
		'/api/tasks/:id/done/:memberId/:day',
		{ schema: { params: doneParams } },
		async (req, reply) => {
			const task = get(req.params.id);
			if (!task) return reply.code(404).send({ error: 'Task not found' });
			if (!memberExists(db, req.params.memberId)) return reply.code(400).send({ error: 'Unknown member' });
			if (task.member_id && task.member_id !== req.params.memberId) {
				return reply.code(400).send({ error: 'This task belongs to someone else' });
			}
			// An extra's points are kept with the tick, so changing the task later doesn't change past totals.
			db.prepare(
				'INSERT INTO task_done (task_id, member_id, day, points) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
			).run(req.params.id, req.params.memberId, req.params.day, task.required ? 0 : task.points);
			return reply.code(204).send();
		},
	);
	app.delete<{ Params: DoneParams }>(
		'/api/tasks/:id/done/:memberId/:day',
		{ schema: { params: doneParams } },
		async (req, reply) => {
			const { id, memberId, day } = req.params;
			// Stars can't be taken back once they're in a jar: the bucket never goes below zero.
			const tick = db
				.prepare('SELECT points FROM task_done WHERE task_id = ? AND member_id = ? AND day = ?')
				.get(id, memberId, day) as { points: number } | undefined;
			if (tick && tick.points > bucket(db, memberId))
				return reply.code(409).send({ error: 'Those stars are already in a jar' });
			db.prepare('DELETE FROM task_done WHERE task_id = ? AND member_id = ? AND day = ?').run(id, memberId, day);
			return reply.code(204).send();
		},
	);
}
