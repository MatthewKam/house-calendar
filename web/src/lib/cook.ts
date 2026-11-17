// Cooking together (server/cook.ts): this device's own id among the cooks, the name it last cooked
// under, the link to send, and each person's progress in words.

import type { CookPerson } from '../../../shared/cook.ts';
import { SERVER } from './native';

const ID_KEY = 'sprig-cook-id';
const NAME_KEY = 'sprig-cook-name';

/** Kept on the device so coming back (a reload, the next day) is the same cook; a new one each time without storage. */
let fallbackId: string | null = null;
export function cookId() {
	try {
		const kept = localStorage.getItem(ID_KEY);
		if (kept) return kept;
		const made = crypto.randomUUID();
		localStorage.setItem(ID_KEY, made);
		return made;
	} catch {
		return (fallbackId ??= crypto.randomUUID());
	}
}

/** The name last cooked under on this device ('' if none). */
export function keptName() {
	try {
		return localStorage.getItem(NAME_KEY) ?? '';
	} catch {
		return '';
	}
}
export function keepName(name: string) {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {
		// Asked again next time.
	}
}

/** "4:05", "1:02:30". */
export function clock(ms: number) {
	const total = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const sec = String(total % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** The link's own calls: /api/cook/<household>/<secret> (hosted.ts lets them through without signing in). */
export const cookBase = (household: string, secret: string) => `/api/cook/${household}/${secret}`;

/** The link to send: the cooking page on Sprig's site (from the phone app too). */
export const cookLink = (household: string, secret: string) =>
	`${SERVER || location.origin}/cook/${household}/${secret}`;

/** "Step 3 of 6 · 2 left to prep · Soup 12:03", or that they're done. */
export function progressWords(p: CookPerson, steps: number, ingredients: number, now: number) {
	const { progress } = p;
	if (progress.doneAt) return 'Done cooking ✓';
	if (!progress.startedAt) return 'Not started yet';
	const parts: string[] = [];
	const next = Array.from({ length: steps }, (_, n) => n).find((n) => !progress.steps.includes(n));
	if (steps) parts.push(next === undefined ? 'All steps done' : `Step ${next + 1} of ${steps}`);
	const toPrep = ingredients - progress.prepped.filter((n) => n < ingredients).length;
	if (ingredients) parts.push(toPrep ? `${toPrep} left to prep` : 'All prepped');
	for (const t of progress.timers)
		parts.push(`⏲ ${t.name ?? `${t.minutes} min`} ${t.endsAt <= now ? 'done!' : clock(t.endsAt - now)}`);
	return parts.join(' · ');
}

/** "Lasts until 6:30 PM", "until Thu 6:30 PM". */
export function untilWords(until: number) {
	const at = new Date(until);
	const sameDay = at.toDateString() === new Date().toDateString();
	return at.toLocaleString(
		[],
		sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', hour: 'numeric', minute: '2-digit' },
	);
}
