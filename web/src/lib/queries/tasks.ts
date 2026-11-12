// Kids' tasks and what's done, moments, goals and the potty chart.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { addDays, dayKey, fromDayKey } from '../dates';
import type { TaskDone, TaskInput, Task, PottyChart } from '../types';
import { showNow, putBack, newId, REFRESH_MS, keys } from './shared';

export function useTasks() {
	return useQuery({ queryKey: keys.tasks, queryFn: api.tasks });
}

/** Check-offs for the 7 days starting at `weekStart`. Refreshes so other screens' taps show up. */
/** Ticks for the `days` local days starting at `from` (a week by default, or a whole month). */
export function useTasksDone(from: Date, days = 7) {
	return useQuery({
		queryKey: keys.tasksRange(from, days),
		queryFn: () => api.tasksDone(dayKey(from), dayKey(addDays(from, days))),
		refetchInterval: REFRESH_MS,
		placeholderData: keepPreviousData,
	});
}

/** Ticks a task on or off, showing the change before the server answers. */
/** Ticks a task on or off, updating the `from`/`days` range on screen straight away. */
export function useSetTaskDone(from: Date, days = 7) {
	const qc = useQueryClient();
	const key = keys.tasksRange(from, days);
	return useMutation({
		mutationFn: ({ taskId, memberId, day, done }: TaskDone & { done: boolean }) =>
			api.setTaskDone(taskId, memberId, day, done),
		onMutate: async ({ taskId, memberId, day, done }) => {
			await qc.cancelQueries({ queryKey: key });
			const before = qc.getQueryData<TaskDone[]>(key);
			qc.setQueryData<TaskDone[]>(key, (list = []) =>
				done
					? [...list, { taskId, memberId, day }]
					: list.filter((d) => !(d.taskId === taskId && d.memberId === memberId && d.day === day)),
			);
			return { before };
		},
		onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.before),
		// Tasks too: a one-time task's done day comes with it.
		onSettled: () => Promise.all([keys.tasksDone, keys.tasks].map((queryKey) => qc.invalidateQueries({ queryKey }))),
	});
}

export function useSaveTask() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, input }: { id?: string; input: TaskInput }) =>
			id ? api.updateTask(id, input) : api.addTask(input),
		onMutate: ({ id, input }) =>
			showNow(qc, [
				{
					key: keys.tasks,
					apply: (tasks: Task[]) =>
						id
							? tasks.map((t) => (t.id === id ? { ...t, ...input } : t))
							: [
									...tasks,
									{
										...input,
										id: newId('task'),
										sortOrder: tasks.length,
										createdAt: new Date().toISOString(),
										doneOn: {},
									} as Task,
								],
				},
			]),
		onError: putBack(qc),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
	});
}

/** Today's moments, for the stickers on each kid's card and the cheer when a new one comes in. */
export function useMoments(today: string) {
	return useQuery({
		queryKey: keys.moments(today),
		queryFn: () => api.moments(today, dayKey(addDays(fromDayKey(today), 1))),
		refetchInterval: REFRESH_MS,
	});
}

/** Moments from `from` up to today, newest first: the history to take one back from. */
export function useMomentHistory(from: string, today: string) {
	return useQuery({
		queryKey: keys.momentHistory(from),
		queryFn: async () => (await api.moments(from, dayKey(addDays(fromDayKey(today), 1)))).reverse(),
	});
}

/** The goal list to pick from: starter goals and the family's own. */
export function useGoalLibrary() {
	return useQuery({ queryKey: ['goalLibrary'], queryFn: api.goalLibrary });
}

/** The goal list: hide or show goals, all at once too, and save a parent's own to it. */
export function useGoalActions() {
	const qc = useQueryClient();
	const onSettled = () => qc.invalidateQueries({ queryKey: ['goalLibrary'] });
	return {
		hide: useMutation({ mutationFn: api.hideGoal, onSettled }),
		hideAll: useMutation({ mutationFn: api.hideAllGoals, onSettled }),
		save: useMutation({ mutationFn: api.saveOwnGoal, onSettled }),
	};
}

/** Every kid on a potty chart, with their card. */
export function usePotty() {
	return useQuery({ queryKey: keys.potty, queryFn: api.potty, refetchInterval: REFRESH_MS });
}

/** Start or stop a chart, punch a row, or take a punch back; each refreshes the cards and the buckets. */
export function usePottyActions() {
	const qc = useQueryClient();
	const onSettled = () => qc.invalidateQueries({ queryKey: keys.tasksDone });
	return {
		setOn: useMutation({
			mutationFn: ({ memberId, on }: { memberId: string; on: boolean }) => api.setPotty(memberId, on),
			onSettled,
		}),
		punch: useMutation({
			mutationFn: api.punch,
			// The card shows the punch straight away.
			onSuccess: ({ chart }) =>
				qc.setQueryData<PottyChart[]>(keys.potty, (list = []) =>
					list.map((c) => (c.memberId === chart.memberId ? chart : c)),
				),
			onSettled,
		}),
		takeBack: useMutation({ mutationFn: api.takeBackPunch, onSettled }),
	};
}

/** Catch a moment, or take one back; both refresh the stickers and the buckets. */
export function useMomentActions() {
	const qc = useQueryClient();
	const onSettled = () => qc.invalidateQueries({ queryKey: keys.tasksDone });
	return {
		add: useMutation({ mutationFn: api.addMoment, onSettled }),
		remove: useMutation({ mutationFn: api.removeMoment, onSettled }),
	};
}

/** Saves a new order for all tasks, showing it straight away. */
export function useReorderTasks() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (ids: string[]) => api.reorderTasks(ids),
		onMutate: async (ids) => {
			await qc.cancelQueries({ queryKey: keys.tasks });
			const before = qc.getQueryData<Task[]>(keys.tasks);
			if (before) {
				const byId = new Map(before.map((t) => [t.id, t]));
				qc.setQueryData<Task[]>(
					keys.tasks,
					ids.map((id) => byId.get(id)).filter((t): t is Task => !!t),
				);
			}
			return { before };
		},
		onError: (_e, _v, ctx) => qc.setQueryData(keys.tasks, ctx?.before),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
	});
}

export function useDeleteTask() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.removeTask(id),
		onMutate: (id) => showNow(qc, [{ key: keys.tasks, apply: (tasks: Task[]) => tasks.filter((t) => t.id !== id) }]),
		onError: putBack(qc),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
	});
}
