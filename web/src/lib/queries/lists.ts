// Lists: Sprig's own, and Reminders.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { ReminderList, SprigList, SprigItem } from '../types';
import { type Patch, showNow, putBack, newId, keys } from './shared';

/** Reminders lists; refreshed often so a phone's sync shows up soon after it runs. */
export function useReminders() {
	return useQuery({ queryKey: keys.reminders, queryFn: api.reminders, refetchInterval: 30_000 });
}

/** Adding or ticking an item: the server answers with the updated lists, which replace the cache. */
export function useChangeReminders() {
	const qc = useQueryClient();
	const replace = (r: { lists: unknown }) =>
		qc.setQueryData(keys.reminders, (old: { enabled: boolean } | undefined) => ({
			enabled: old?.enabled ?? true,
			lists: r.lists,
		}));
	const items = (apply: (l: ReminderList) => ReminderList): Patch => ({
		key: keys.reminders,
		apply: (d: { enabled: boolean; lists: ReminderList[] }) => ({ ...d, lists: d.lists.map(apply) }),
	});
	return {
		add: useMutation({
			mutationFn: ({ list, title }: { list: string; title: string }) => api.addReminder(list, title),
			onMutate: ({ list, title }) =>
				showNow(qc, [
					items((l) =>
						l.title === list
							? {
									...l,
									items: [
										...l.items.filter((i) => !i.done),
										{ id: newId('w'), title, done: false, due: null, pending: true },
										...l.items.filter((i) => i.done),
									],
								}
							: l,
					),
				]),
			onError: putBack(qc),
			onSuccess: replace,
		}),
		setDone: useMutation({
			mutationFn: ({ id, done }: { id: string; done: boolean }) => api.setReminderDone(id, done),
			onMutate: ({ id, done }) =>
				showNow(qc, [
					items((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, done, pending: true } : i)) })),
				]),
			onError: putBack(qc),
			onSuccess: replace,
		}),
		rename: useMutation({
			mutationFn: ({ id, title }: { id: string; title: string }) => api.renameReminder(id, title),
			onMutate: ({ id, title }) =>
				showNow(qc, [
					items((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, title, pending: true } : i)) })),
				]),
			onError: putBack(qc),
			onSuccess: replace,
		}),
	};
}

/** Sprig's own lists. */
export function useLists() {
	return useQuery({ queryKey: ['lists'], queryFn: api.lists, refetchInterval: 30_000 });
}

/**
 * Changing Sprig's lists: each answer is every list, which replaces the cache. Adding and ticking
 * show straight away.
 */
export function useListActions() {
	const qc = useQueryClient();
	const key = ['lists'];
	const replace = (lists: SprigList[]) => qc.setQueryData(key, lists);
	const items = (apply: (l: SprigList) => SprigList): Patch => ({
		key,
		apply: (lists: SprigList[]) => lists.map(apply),
	});
	const usePlain = <V>(mutationFn: (v: V) => Promise<SprigList[]>) => useMutation({ mutationFn, onSuccess: replace });
	return {
		addList: usePlain(api.addList),
		renameList: usePlain(({ id, title }: { id: string; title: string }) => api.renameList(id, title)),
		deleteList: usePlain(api.deleteList),
		clearDone: usePlain(api.clearDone),
		add: useMutation({
			mutationFn: ({
				listId,
				...item
			}: {
				listId: string;
				title: string;
				due?: string | null;
				memberId?: string | null;
			}) => api.addListItem(listId, item),
			onMutate: ({ listId, title, due = null, memberId = null }) =>
				showNow(qc, [
					items((l) =>
						l.id === listId
							? {
									...l,
									items: [
										...l.items.filter((i) => !i.done),
										{ id: newId('item'), title, done: false, due, memberId, doneAt: null },
										...l.items.filter((i) => i.done),
									],
								}
							: l,
					),
				]),
			onError: putBack(qc),
			onSuccess: replace,
		}),
		update: useMutation({
			mutationFn: ({
				id,
				...patch
			}: { id: string } & Partial<Pick<SprigItem, 'title' | 'done' | 'due' | 'memberId'>>) =>
				api.updateListItem(id, patch),
			onMutate: ({ id, ...patch }) =>
				showNow(qc, [items((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))]),
			onError: putBack(qc),
			onSuccess: replace,
		}),
		remove: usePlain(api.deleteListItem),
	};
}
