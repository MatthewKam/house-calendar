// A day's plans: your reminders on it (server/specialReminders.ts), and the note and list the grown-ups
// share (server/dayPlans.ts).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DayPlans } from '../../../../shared/dayPlans.ts';
import { api } from '../api';
import { useParent } from '../useParent';
import { useAuthStatus } from './family';
import { keys } from './shared';

export function useSpecialReminders(enabled = true) {
	return useQuery({ queryKey: keys.specialReminders, queryFn: api.specialReminders, enabled });
}

/** Adding and taking off reminders; the list is fetched again after each. */
export function useChangeSpecialReminders() {
	const qc = useQueryClient();
	const refresh = () => qc.invalidateQueries({ queryKey: keys.specialReminders });
	return {
		add: useMutation({ mutationFn: api.addSpecialReminder, onSuccess: refresh }),
		remove: useMutation({ mutationFn: api.removeSpecialReminder, onSuccess: refresh }),
	};
}

/**
 * Who sees a day's plans here: the note and list, a grown-up who may change things (not a kid's own
 * device, nor the wall until a PIN); reminders, only on a guardian's own device (they come as its alerts).
 */
export function usePlansAccess() {
	const status = useAuthStatus().data;
	const { parent } = useParent();
	const signedIn = status?.signedIn ? status : null;
	return {
		plans: parent && signedIn?.role !== 'kid',
		reminders: signedIn?.kind === 'user' && signedIn.role === 'guardian' && !signedIn.wallMode,
	};
}

export function useDayPlans(enabled = true) {
	return useQuery({ queryKey: keys.dayPlans, queryFn: api.dayPlans, enabled });
}

/** Changing a day's note, list or ticks; each answers with every day's plans. */
export function useChangeDayPlans() {
	const qc = useQueryClient();
	const onSuccess = (plans: DayPlans) => qc.setQueryData(keys.dayPlans, plans);
	return {
		note: useMutation({ mutationFn: api.setDayNote, onSuccess }),
		list: useMutation({ mutationFn: api.setDayList, onSuccess }),
		// Ticked straight away; put right by what the server answers (or fetched again if it fails).
		tick: useMutation({
			mutationFn: api.tickDayList,
			onMutate: ({ key, itemId, day, done }) =>
				qc.setQueryData<DayPlans>(
					keys.dayPlans,
					(p) =>
						p && {
							...p,
							lists: {
								...p.lists,
								[key]: (p.lists[key] ?? []).map((x) =>
									x.id === itemId ? { ...x, ticked: done ? [...x.ticked, day] : x.ticked.filter((d) => d !== day) } : x,
								),
							},
						},
				),
			onSuccess,
			onError: () => qc.invalidateQueries({ queryKey: keys.dayPlans }),
		}),
	};
}
