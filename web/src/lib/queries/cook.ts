// Cooking together (server/cook.ts): the recipe's link on the family's side, and cooking along with
// it from either side (the recipe in the app, or the link's own page).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { CookAlong, CookProgress } from '../../../../shared/cook.ts';
import { cookId } from '../cook';
import { useLive } from './shared';

const roomKey = (recipeId: string) => ['cook-room', recipeId];

/** The recipe's link, while there is one; checked every 30 seconds, so "Grandma is cooking this" shows up. */
export const useCookRoom = (recipeId: string) =>
	useQuery({ queryKey: roomKey(recipeId), queryFn: () => api.cookRoom(recipeId), refetchInterval: 30_000 });

/** Making the link, making it last longer, and ending it. */
export function useCookActions(recipeId: string) {
	const qc = useQueryClient();
	const replace = (r: { room: unknown }) => qc.setQueryData(roomKey(recipeId), r);
	return {
		start: useMutation({ mutationFn: () => api.startCook(recipeId), onSuccess: replace }),
		length: useMutation({ mutationFn: (hours: number) => api.cookLength(recipeId, hours), onSuccess: replace }),
		end: useMutation({
			mutationFn: () => api.endCook(recipeId),
			onSuccess: () => qc.setQueryData(roomKey(recipeId), { room: null }),
		}),
	};
}

/**
 * Cooking along with a link (base: lib/cook.ts cookBase): says this device's name and progress as it
 * changes (and joins with the first), and has everyone's, live, while `me` is given. Answers who's
 * cooking (null until known).
 */
export function useCookTogether(base: string | null, me: { name: string; progress: CookProgress } | null) {
	const qc = useQueryClient();
	const key = ['cook', base];
	// The recipe too (the link's page shows it); live answers change only who's cooking.
	const status = useQuery<CookAlong>({ queryKey: key, queryFn: () => api.cookAlong(base!), enabled: !!base });
	useLive(
		!!base && !!me,
		key,
		(stamp, signal) => api.cookLive(base!, stamp, signal),
		({ until, people }, old) => ({ ...(old as CookAlong), until, people }),
	);
	// Each change said once, a moment after the last tick (several quick ticks, one call). Not through
	// (no signal): tried again in a few seconds.
	const said = useRef('');
	const [tries, setTries] = useState(0);
	const words = me && JSON.stringify(me);
	useEffect(() => {
		if (!base || !me || !words || words === said.current) return;
		const t = setTimeout(() => {
			said.current = words;
			api.cookMe(base, { cookId: cookId(), ...me }).then(
				(answer) => qc.setQueryData(key, (old: CookAlong | undefined) => old && { ...old, ...answer }),
				() => {
					said.current = '';
					setTimeout(() => setTries((n) => n + 1), 5_000);
				},
			);
		}, 400);
		return () => clearTimeout(t);
		// me and key are in words and base.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [base, words, tries]);
	return status;
}
