import { describe, expect, it } from 'vitest';
import { dueOn, expired, goalsOf, requiredDone, taskProgress } from './tasks';
import type { Task, TaskDone } from './types';

// Tuesday 10 November 2026.
const TUE = new Date(2026, 10, 10);
const task = (p: Partial<Task>): Task => ({
	id: 't',
	title: 'Brush teeth',
	memberId: 'mia',
	days: [0, 1, 2, 3, 4, 5, 6],
	sortOrder: 0,
	createdAt: new Date(2026, 9, 1).toISOString(),
	time: null,
	category: 'non_negotiable',
	required: true,
	points: 0,
	icon: null,
	dueBy: null,
	doneOn: {},
	...p,
});
const ticked = (taskId: string, memberId: string, day: string): TaskDone => ({ taskId, memberId, day }) as TaskDone;

describe("today's tasks", () => {
	it('is due on its weekdays, from the day it was added', () => {
		expect(dueOn(task({}), TUE, 'mia')).toBe(true);
		expect(dueOn(task({ days: [1, 3] }), TUE, 'mia')).toBe(false);
		// Added after that day: not missed.
		expect(dueOn(task({ createdAt: new Date(2026, 10, 11).toISOString() }), TUE, 'mia')).toBe(false);
	});

	it("keeps a one-time task until it's done or its day is past", () => {
		const once = task({ dueBy: '2026-11-12' });
		expect(dueOn(once, TUE, 'mia')).toBe(true);
		// Done yesterday: off the list today.
		expect(dueOn({ ...once, doneOn: { mia: '2026-11-09' } }, TUE, 'mia')).toBe(false);
		// Done today: still shows (ticked) today.
		expect(dueOn({ ...once, doneOn: { mia: '2026-11-10' } }, TUE, 'mia')).toBe(true);
		expect(dueOn(task({ dueBy: '2026-11-09' }), TUE, 'mia')).toBe(false);
		expect(expired(task({ dueBy: '2026-11-09' }), '2026-11-10')).toBe(true);
	});

	it("is all done when every required task due today is ticked (extras don't count)", () => {
		const tasks = [
			task({ id: 'a' }),
			task({ id: 'b', memberId: null }),
			task({ id: 'x', required: false, category: 'bonus', points: 2 }),
		];
		expect(requiredDone(tasks, [ticked('a', 'mia', '2026-11-10')], 'mia', '2026-11-10')).toBe(false);
		const both = [ticked('a', 'mia', '2026-11-10'), ticked('b', 'mia', '2026-11-10')];
		expect(requiredDone(tasks, both, 'mia', '2026-11-10')).toBe(true);
		// Everyone's task ticked by someone else doesn't count for Mia.
		expect(
			requiredDone(tasks, [ticked('a', 'mia', '2026-11-10'), ticked('b', 'sam', '2026-11-10')], 'mia', '2026-11-10'),
		).toBe(false);
		// Nothing due: not "all done".
		expect(requiredDone([], [], 'mia', '2026-11-10')).toBe(false);
	});

	it("fills each kid's bar with their own and everyone's required tasks", () => {
		const tasks = [task({ id: 'a' }), task({ id: 'b', memberId: null }), task({ id: 'c', memberId: 'sam' })];
		const progress = taskProgress(tasks, [ticked('a', 'mia', '2026-11-10')], '2026-11-10', ['mia', 'sam', 'kai']);
		expect(progress.get('mia')).toEqual({ due: 2, done: 1 });
		expect(progress.get('sam')).toEqual({ due: 2, done: 0 });
		// Kai's only task is everyone's.
		expect(progress.get('kai')).toEqual({ due: 1, done: 0 });
	});

	it("counts a kid's goals, their own and everyone's, not one-time ones that are over", () => {
		const goals = [
			task({ id: 'g1', required: false, category: 'bonus' }),
			task({ id: 'g2', required: false, category: 'bonus', memberId: null }),
			task({ id: 'g3', required: false, category: 'bonus', dueBy: '2026-11-01' }),
			task({ id: 'g4', required: false, category: 'bonus', memberId: 'sam' }),
		];
		expect(goalsOf(goals, 'mia', '2026-11-10').map((g) => g.id)).toEqual(['g1', 'g2']);
		expect(goalsOf(goals, 'mia', '2026-11-10', 'g1').map((g) => g.id)).toEqual(['g2']);
	});
});
