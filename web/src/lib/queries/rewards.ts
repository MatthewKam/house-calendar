// Reward jars, their history and the stars waiting in buckets.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { RewardInput, Reward, RewardWin, Bucket, StarPlacing } from '../types';
import { type Patch, showNow, putBack, newId, REFRESH_MS, keys } from './shared';

/** Reward jars still going (filling, earned or missed), as of `today`. */
export function useRewards(today: string) {
	return useQuery({ queryKey: keys.rewards(today), queryFn: () => api.rewards(today), refetchInterval: REFRESH_MS });
}

/** Every jar filled or missed (waiting to be redeemed first, then the rest, newest first). */
export function useRewardHistory() {
	return useQuery({ queryKey: keys.rewardHistory, queryFn: api.rewardHistory, refetchInterval: REFRESH_MS });
}

/** Stars each kid can still put in jars. Ticks refresh them too. */
export function useBuckets() {
	return useQuery({ queryKey: keys.buckets, queryFn: api.buckets, refetchInterval: REFRESH_MS });
}

/** Add, change, fill, redeem and delete jars; each refreshes the jars, buckets and history afterwards. */
export function useRewardActions() {
	const qc = useQueryClient();
	const refresh = () => qc.invalidateQueries({ queryKey: ['tasksDone', 'rewards'] });
	// The jar lists are the ones keyed by a day (not the history or buckets).
	const jars = (apply: (list: Reward[]) => Reward[]): Patch => ({
		key: ['tasksDone', 'rewards'],
		skip: (k) => !/^\d{4}-/.test(String(k[2] ?? '')),
		apply,
	});
	const history = (apply: (list: RewardWin[]) => RewardWin[]): Patch => ({ key: keys.rewardHistory, apply });
	const buckets = (apply: (list: Bucket[]) => Bucket[]): Patch => ({ key: keys.buckets, apply });
	const useEdit = <V>(mutationFn: (v: V) => Promise<unknown>, patches: (v: V) => Patch[]) =>
		useMutation({
			mutationFn,
			onMutate: (v: V) => showNow(qc, patches(v)),
			onError: putBack(qc),
			onSettled: refresh,
		});
	const redeemed = (id: string, givenAt: string | null) => [
		history((wins) => wins.map((w) => (w.id === id ? { ...w, givenAt } : w))),
	];
	return {
		save: useEdit(
			({ id, reward, today }: { id?: string; reward: RewardInput; today: string }) =>
				id ? api.updateReward(id, reward, today) : api.addReward(reward, today),
			({ id, reward }) => [
				jars((list) =>
					id
						? list.map((r) => (r.id === id ? { ...r, ...reward } : r))
						: [...list, { ...reward, id: newId('reward'), stars: 0, memberStars: {}, status: 'filling' }],
				),
			],
		),
		/** Stars into jars: out of the bucket (or the missed jar they're moved from) and into each jar. */
		place: useEdit(
			(p: StarPlacing) => api.placeStars(p),
			({ memberId, from, places }) => {
				const spent = places.reduce((a, x) => a + x.stars, 0);
				const freed = from
					? (qc
							.getQueriesData<Reward[]>({ queryKey: ['tasksDone', 'rewards'] })
							.flatMap(([, d]) => (Array.isArray(d) ? d : []))
							.find((r) => r.id === from)?.memberStars[memberId] ?? 0)
					: 0;
				return [
					buckets((list) => list.map((b) => (b.memberId === memberId ? { ...b, stars: b.stars + freed - spent } : b))),
					jars((list) =>
						list.map((r) => {
							const n =
								(r.id === from ? -(r.memberStars[memberId] ?? 0) : 0) +
								places.filter((x) => x.rewardId === r.id).reduce((a, x) => a + x.stars, 0);
							return n
								? {
										...r,
										stars: r.stars + n,
										memberStars: { ...r.memberStars, [memberId]: (r.memberStars[memberId] ?? 0) + n },
									}
								: r;
						}),
					),
				];
			},
		),
		restore: useEdit(
			({ id, deadline, today }: { id: string; deadline: string | null; today: string }) =>
				api.restoreReward(id, deadline, today),
			({ id, deadline }) => [
				jars((list) => list.map((r) => (r.id === id ? { ...r, deadline, status: 'filling' as const } : r))),
			],
		),
		/** A parent takes a kid's stars back out of a jar (with the master PIN). A wrong PIN is shown in its dialog, not as a toast. */
		takeBack: useMutation({
			mutationFn: ({ id, memberId, stars }: { id: string; memberId: string; stars: number }) =>
				api.takeBack(id, memberId, stars),
			meta: { inline: true },
			onSettled: refresh,
		}),
		redeem: useEdit(
			(id: string) => api.redeem(id),
			(id) => redeemed(id, new Date().toISOString()),
		),
		undoRedeem: useEdit(
			(id: string) => api.undoRedeem(id),
			(id) => redeemed(id, null),
		),
		remove: useEdit(
			(id: string) => api.removeReward(id),
			(id) => [jars((list) => list.filter((r) => r.id !== id))],
		),
	};
}
