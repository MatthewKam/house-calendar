import type { CookTimer } from '../../../shared/cook.ts';

// Where each recipe was left on this device: its ticks, the amount, and cooking (RecipeView). A recipe
// with any of them shows under Currently viewing on the Recipes page; a day after the last change, or
// once it's cooked, it's forgotten. Without storage (private browsing, or blocked), nothing is kept.

export interface RecipeProgress {
	/** Ingredients in the house (planning), by index. */
	have: number[];
	/** Ingredients prepped or gathered (cooking), by index. */
	prepped: number[];
	steps: number[];
	scale: number;
	/** Cooking since (ms), or null while planning. */
	cookingSince: number | null;
	timers: CookTimer[];
	/** Last changed (ms). */
	at: number;
}

const KEY = 'sprig:recipe-progress';
const DAY = 24 * 60 * 60_000;

/** Anything to come back to: a box ticked, or cooking. */
export const started = (p: Omit<RecipeProgress, 'at'>) =>
	p.cookingSince !== null || p.have.length > 0 || p.prepped.length > 0 || p.steps.length > 0;

/** The ones changed within a day of `now`. */
export const fresh = (all: Record<string, RecipeProgress>, now: number) =>
	Object.fromEntries(Object.entries(all).filter(([, p]) => now - p.at < DAY));

/** How far along, for its card: "Cooking · 2 of 5 steps" or "3 of 8 ingredients ticked". */
export function progressText(p: RecipeProgress, ingredients: number, steps: number) {
	if (p.cookingSince !== null) return `Cooking · ${p.steps.length} of ${steps} steps`;
	if (p.have.length) return `${p.have.length} of ${ingredients} ingredients ticked`;
	return `${p.steps.length} of ${steps} steps ticked`;
}

function read(): Record<string, RecipeProgress> {
	try {
		const all = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return all && typeof all === 'object' ? fresh(all, Date.now()) : {};
	} catch {
		return {};
	}
}

/** Every recipe left partway, most recent first. */
export const allProgress = () =>
	Object.entries(read())
		.map(([id, p]) => ({ id, ...p }))
		.sort((a, b) => b.at - a.at);

export const progressOf = (id: string): RecipeProgress | null => read()[id] ?? null;

/** Keeps where a recipe is (stamped now), or forgets it (null, or nothing ticked). */
export function saveProgress(id: string, p: Omit<RecipeProgress, 'at'> | null) {
	const all = read();
	if (p && started(p)) all[id] = { ...p, at: Date.now() };
	else delete all[id];
	try {
		localStorage.setItem(KEY, JSON.stringify(all));
	} catch {
		// Storage blocked: it's kept only while the recipe is open.
	}
}
