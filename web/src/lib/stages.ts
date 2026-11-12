import type { Stage } from './types';

// The stages from docs/product-plan.md ("Growing up"), for Settings. The server works them out
// (server/stages.ts); this only names them.

export const STAGE_NAMES: Record<Stage, string> = {
	little: 'Little',
	early: 'Early',
	middle: 'Middle',
	tween: 'Tween',
	teen: 'Teen',
	adult: 'Adult',
};

export const STAGE_AGES: Record<Stage, string> = {
	little: '2–3',
	early: '4–6',
	middle: '7–10',
	tween: '11–14',
	teen: '15–18',
	adult: '18+',
};

export const STAGE_LIST = Object.keys(STAGE_NAMES) as Stage[];
