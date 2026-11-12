// Events: the calendar's range, saving and deleting, who they're for, privacy, special days, checklists,
// changes waiting for iCloud or Google, time-to-leave alerts and travel times.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { addDays, dayKey } from '../dates';
import type { EventInput, CalEvent, LeaveAlert, ChecklistItem, OutboxStatus, Visibility } from '../types';
import { showNow, putBack, newId, REFRESH_MS, keys } from './shared';

/** Events overlapping the `days` local days starting at `from`. */
export function useRangeEvents(from: Date, days: number) {
	return useQuery({
		queryKey: keys.range(from, days),
		queryFn: () => {
			const to = addDays(from, days);
			return api.events(from, to, dayKey(from), dayKey(to));
		},
		refetchInterval: REFRESH_MS,
		// Keep showing the old range while the next one loads, so paging doesn't flash empty.
		placeholderData: keepPreviousData,
	});
}

/** "Time to leave" alerts; checked often so the wall shows one on time. */
export function useAlerts() {
	return useQuery({ queryKey: ['alerts'], queryFn: api.alerts, refetchInterval: 30_000 });
}

export function useAlertActions() {
	const qc = useQueryClient();
	const refresh = () => qc.invalidateQueries({ queryKey: ['alerts'] });
	const gone = (id: string) =>
		showNow(qc, [{ key: ['alerts'], apply: (list: LeaveAlert[]) => list.filter((x) => x.id !== id) }]);
	return {
		add: useMutation({
			mutationFn: ({ eventId, minutesBefore }: { eventId: string; minutesBefore: number }) =>
				api.addAlert(eventId, minutesBefore),
			onSettled: refresh,
		}),
		dismiss: useMutation({
			mutationFn: (id: string) => api.dismissAlert(id),
			onMutate: (id) => gone(id),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		cancel: useMutation({
			mutationFn: (id: string) => api.cancelAlert(id),
			onMutate: (id) => gone(id),
			onError: putBack(qc),
			onSettled: refresh,
		}),
	};
}

export function useSaveEvent() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, input }: { id?: string; input: EventInput }) =>
			id ? api.updateEvent(id, input) : api.addEvent(input),
		onMutate: ({ id, input }) => {
			const { scope: _scope, calendarId, ...details } = input;
			return showNow(qc, [
				{
					key: keys.events,
					apply: (list: CalEvent[]) =>
						id
							? list.map((e) =>
									e.id === id
										? {
												...e,
												...details,
												location: details.location ?? null,
												syncState: e.calendarId === 'local' ? e.syncState : 'pending_update',
											}
										: e,
								)
							: [
									...list,
									{
										...details,
										id: newId('event'),
										calendarId: calendarId ?? 'local',
										location: details.location ?? null,
										visibility: details.visibility ?? 'everyone',
										syncState: calendarId && calendarId !== 'local' ? 'pending_create' : 'synced',
										repeats: false,
									},
								],
				},
			]);
		},
		onError: putBack(qc),
		// An iCloud event's edit also changes what's waiting to be sent.
		onSettled: () =>
			Promise.all([qc.invalidateQueries({ queryKey: keys.events }), qc.invalidateQueries({ queryKey: ['outbox'] })]),
	});
}

export function useSetPeople() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, memberIds }: { id: string; memberIds: string[] }) => api.setPeople(id, memberIds),
		onMutate: ({ id, memberIds }) =>
			showNow(qc, [
				{ key: keys.events, apply: (list: CalEvent[]) => list.map((e) => (e.id === id ? { ...e, memberIds } : e)) },
			]),
		onError: putBack(qc),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
	});
}

/** Who sees an event (every repeat of it): everyone, busy or private. */
export function useSetVisibility() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, visibility }: { id: string; visibility: Visibility }) => api.setVisibility(id, visibility),
		onMutate: ({ id, visibility }) =>
			showNow(qc, [
				{ key: keys.events, apply: (list: CalEvent[]) => list.map((e) => (e.id === id ? { ...e, visibility } : e)) },
			]),
		onError: putBack(qc),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
	});
}

/** Marking an event special (a countdown on kid mode's Today), or not. */
export function useSetSpecial() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, special }: { id: string; special: boolean }) => api.setSpecial(id, special),
		onMutate: ({ id, special }) =>
			showNow(qc, [
				{ key: keys.events, apply: (list: CalEvent[]) => list.map((e) => (e.id === id ? { ...e, special } : e)) },
			]),
		onError: putBack(qc),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
	});
}

/** What to bring on an event (every repeat of it): the whole list, in order. */
export function useSetChecklist() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, items }: { id: string; items: ChecklistItem[] }) =>
			api.setChecklist(
				id,
				items.map((x) => ({ id: x.id, title: x.title, picture: x.picture })),
			),
		onMutate: ({ id, items }) =>
			showNow(qc, [
				{
					key: keys.events,
					apply: (list: CalEvent[]) => list.map((e) => (e.id === id ? { ...e, checklist: items } : e)),
				},
			]),
		onError: putBack(qc),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
	});
}

/** Ticking a thing to bring, for this time the event happens. */
export function useTickChecklist() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, itemId, done }: { id: string; itemId: string; done: boolean }) =>
			api.tickChecklist(id, itemId, done),
		onMutate: ({ id, itemId, done }) =>
			showNow(qc, [
				{
					key: keys.events,
					apply: (list: CalEvent[]) =>
						list.map((e) =>
							e.id === id ? { ...e, checklist: e.checklist.map((x) => (x.id === itemId ? { ...x, done } : x)) } : e,
						),
				},
			]),
		onError: putBack(qc),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
	});
}

/** Undo for deleting an iCloud event (before the delete is sent). */
export function useRestoreEvent() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.restoreEvent(id),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
	});
}

/** Wall edits waiting for iCloud and conflicts to settle; checked often, and after every edit. */
export function useOutbox() {
	return useQuery({ queryKey: ['outbox'], queryFn: api.outbox, refetchInterval: 20_000 });
}

export function useResolveConflict() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, keep }: { id: number; keep: 'mine' | 'theirs' }) => api.resolveConflict(id, keep),
		onMutate: ({ id }) =>
			showNow(qc, [
				{ key: ['outbox'], apply: (o: OutboxStatus) => ({ ...o, conflicts: o.conflicts.filter((c) => c.id !== id) }) },
			]),
		onError: putBack(qc),
		onSuccess: (status) => qc.setQueryData(['outbox'], status),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
	});
}

export function useDeleteEvent() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, scope }: { id: string; scope?: 'one' | 'all' }) => api.removeEvent(id, scope),
		onMutate: ({ id, scope }) =>
			showNow(qc, [
				{
					key: keys.events,
					apply: (list: CalEvent[]) => {
						const gone = list.find((e) => e.id === id);
						// Every day of a repeating event: the others with its title in the same calendar go too.
						return list.filter(
							(e) =>
								e.id !== id &&
								!(
									scope === 'all' &&
									gone?.repeats &&
									e.repeats &&
									e.calendarId === gone.calendarId &&
									e.title === gone.title
								),
						);
					},
				},
			]),
		onError: putBack(qc),
		// An iCloud event's edit also changes what's waiting to be sent.
		onSettled: () =>
			Promise.all([qc.invalidateQueries({ queryKey: keys.events }), qc.invalidateQueries({ queryKey: ['outbox'] })]),
	});
}

/**
 * Drive minutes from home to each of today's events still to come that has an address, by event id
 * (for the screen saver; the server keeps the answers, so this is cheap). Empty without a Google
 * Maps key or a home address.
 */
export function useTravelTimes(eventIds: string[]) {
	// Keyed by the events shown, so a new or changed event is timed straight away.
	return useQuery({
		queryKey: ['travelTimes', eventIds.join(',')],
		queryFn: api.travelTimes,
		refetchInterval: 10 * 60_000,
		staleTime: 5 * 60_000,
		retry: false,
		placeholderData: keepPreviousData,
	});
}
