// What every data hook shares: the query keys, the refresh time, and showing an edit straight away.

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { dayKey } from '../dates';

// ---- Edits show straight away ---------------------------------------------------------------
// Every edit changes what's on screen first (the cached data), then saves in the background. If
// the save fails, the screen is put back and the app says so (main.tsx); either way, the data is
// fetched again afterwards so it ends up exactly as the server has it.

export interface Patch {
	key: QueryKey;
	/** Leave some matching queries alone (e.g. the reward history, which has a different shape). */
	skip?: (key: QueryKey) => boolean;
	apply: (old: any) => unknown;
}
type Before = { before: [QueryKey, unknown][] };

/** Changes each matching cached query now, remembering how it was. */
export async function showNow(qc: QueryClient, patches: Patch[]): Promise<Before> {
	const before: [QueryKey, unknown][] = [];
	for (const p of patches) {
		// A fetch already on its way would bring back the old data over the change.
		await qc.cancelQueries({ queryKey: p.key });
		for (const [key, data] of qc.getQueriesData({ queryKey: p.key })) {
			if (data === undefined || p.skip?.(key)) continue;
			before.push([key, data]);
			qc.setQueryData(key, p.apply(data));
		}
	}
	return { before };
}
/** The save failed: put the screen back as it was. */
export const putBack = (qc: QueryClient) => (_e: Error, _v: unknown, ctx?: Before) =>
	ctx?.before.forEach(([key, data]) => qc.setQueryData(key, data));
export const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const REFRESH_MS = 60_000;

export const keys = {
	auth: ['auth'] as const,
	members: ['members'] as const,
	events: ['events'] as const,
	range: (from: Date, days: number) => ['events', dayKey(from), days] as const,
	settings: ['settings'] as const,
	sync: ['sync'] as const,
	calendars: ['calendars'] as const,
	tasks: ['tasks'] as const,
	reminders: ['reminders'] as const,
	tasksDone: ['tasksDone'] as const,
	tasksRange: (from: Date, days: number) => ['tasksDone', dayKey(from), days] as const,
	// Under 'tasksDone' too, so ticking a task refreshes the buckets.
	rewards: (today: string) => ['tasksDone', 'rewards', today] as const,
	rewardHistory: ['tasksDone', 'rewards', 'history'] as const,
	buckets: ['tasksDone', 'rewards', 'buckets'] as const,
	// Under 'tasksDone' too: a moment's star changes the buckets.
	moments: (today: string) => ['tasksDone', 'moments', today] as const,
	momentHistory: (from: string) => ['tasksDone', 'moments', 'history', from] as const,
	// Under 'tasksDone' too: a full row is a star in the bucket.
	potty: ['tasksDone', 'potty'] as const,
	// Under 'tasksDone' too: finishing an activity can earn a star.
	learn: (today: string) => ['tasksDone', 'learn', today] as const,
};
