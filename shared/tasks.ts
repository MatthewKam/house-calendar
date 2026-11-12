// Tasks and goals: what the server takes and gives back, written once. The server checks requests
// against these (server/schemas.ts turns them into the JSON schemas Fastify checks with) and the web app
// imports their types, so the two can't drift apart. The web app imports types only, so zod stays out
// of its bundle.

import { z } from 'zod';

/** A day, YYYY-MM-DD. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Part of the day a task is for. */
export const TaskTime = z.enum(['morning', 'evening']);
/**
 * Tasks are required: Daily ("non_negotiable", its stored name) or Chores. A goal ("bonus", its stored
 * name) is optional, ticked any day it's done for its points.
 */
export const TaskCategory = z.enum(['non_negotiable', 'chores', 'bonus']);

/** What can be set on a task, with nothing filled in: an edit changes only what it sends. */
const taskFields = {
	title: z.string().min(1).max(80),
	/** Who does it; null means everyone, each ticking off their own. */
	memberId: z.string().nullable(),
	/** Weekdays it's due: 0 = Sunday ... 6 = Saturday. */
	days: z.array(z.int().min(0).max(6)).min(1).max(7),
	/** Part of the day it's for; null means any time. */
	time: TaskTime.nullable(),
	category: TaskCategory,
	/** Counts toward the day's bar. Otherwise it's an extra worth `points` (the server works this out from the category). */
	required: z.boolean(),
	points: z.int().min(0).max(1000),
	/** An emoji shown before the title, or null (one emoji can be several code points: skin tones, ZWJ sequences). */
	icon: z.string().max(16).nullable(),
	/** One-time: on the list until it's done or this day ends. Null: it repeats on `days`. */
	dueBy: day.nullable(),
};

/** A new task (POST /api/tasks). Left out, the rest are filled in: a Daily task, any time, no points. */
export const TaskInput = z.strictObject({
	...taskFields,
	time: taskFields.time.default(null),
	category: taskFields.category.default('non_negotiable'),
	required: taskFields.required.default(true),
	points: taskFields.points.default(0),
	icon: taskFields.icon.default(null),
	dueBy: taskFields.dueBy.default(null),
});
/** A change to a task (PATCH /api/tasks/:id): any of its fields, at least one. */
export const TaskPatch = z.strictObject(taskFields).partial();

/** A task as the server gives it back. */
export const Task = z.object({
	id: z.string(),
	...z.object(taskFields).shape,
	sortOrder: z.int(),
	/** When it was added (UTC instant); days before that aren't counted as missed. */
	createdAt: z.string(),
	/** One-time: the day each person did it (it's off their list after that day). */
	doneOn: z.record(z.string(), day),
});

/** One check-off: this person did the task on this local day. */
export const TaskDone = z.object({
	taskId: z.string(),
	memberId: z.string(),
	day,
	/** Stars this tick earned (extras only). */
	points: z.int().optional(),
});

/** Check-offs between two local days, end exclusive (GET /api/tasks/done). */
export const TaskDoneRange = z.object({ from: day, to: day });
/** A new order for tasks (PUT /api/tasks/order): ids in the order they should be listed. */
export const TaskOrder = z.strictObject({ ids: z.array(z.string()).max(1000) });
/** Ticking a task off, or un-ticking it, for one person on one day. */
export const TaskDoneParams = z.object({ id: z.string(), memberId: z.string(), day });

export type TaskTime = z.infer<typeof TaskTime>;
export type TaskCategory = z.infer<typeof TaskCategory>;
/** A new task with every field there (what the server has once the defaults are filled in). */
export type TaskInput = z.output<typeof TaskInput>;
export type TaskPatch = z.infer<typeof TaskPatch>;
export type Task = z.infer<typeof Task>;
export type TaskDone = z.infer<typeof TaskDone>;
