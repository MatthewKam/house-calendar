// Your reminders on special days (server/specialReminders.ts).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { keys } from './shared';

export function useSpecialReminders() {
	return useQuery({ queryKey: keys.specialReminders, queryFn: api.specialReminders });
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
