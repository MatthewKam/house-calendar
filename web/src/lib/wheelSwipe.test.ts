import { describe, expect, it } from 'vitest';
import { wheelSwipe, WHEEL_QUIET } from './wheelSwipe';

/** A swipe as a trackpad sends it: speeding up while the fingers move, then coasting down to nothing. */
function swipe(way: 1 | -1, top = 40): number[] {
	const up = [2, 5, 10, 18, 28, top, top];
	const coast: number[] = [];
	for (let v = top; v >= 1; v = Math.floor(v * 0.9)) coast.push(v);
	return [...up, ...coast].map((v) => v * way);
}

/** Feeds the events 16ms apart (a gap of `gap` ms before each run) and returns the steps. */
function steps(...runs: { events: number[]; gap?: number }[]) {
	const s = wheelSwipe();
	let t = 0;
	const out: number[] = [];
	for (const run of runs) {
		t += run.gap ?? 0;
		for (const dx of run.events) {
			t += 16;
			const step = s.push(dx, t);
			if (step) out.push(step);
		}
	}
	return out;
}

describe('wheelSwipe', () => {
	it('moves one step for one swipe, however long it coasts', () => {
		expect(steps({ events: swipe(1) })).toEqual([1]);
		expect(steps({ events: swipe(-1, 120) })).toEqual([-1]);
	});

	it('moves a step for each swipe in a quick row, while the last still coasts', () => {
		const a = swipe(1, 60);
		// The fingers touch down part way through the coasting: it stops, and the next swipe starts.
		const cut = a.slice(0, 12);
		expect(steps({ events: cut }, { events: swipe(1, 60) }, { events: swipe(1, 60) })).toEqual([1, 1, 1]);
	});

	it('moves a step for a swipe the other way during the coasting', () => {
		expect(steps({ events: swipe(1).slice(0, 10) }, { events: swipe(-1) })).toEqual([1, -1]);
	});

	it('moves a step for each swipe with a pause between', () => {
		expect(steps({ events: swipe(1) }, { events: swipe(1), gap: WHEEL_QUIET + 50 })).toEqual([1, 1]);
	});

	it("doesn't count a fast swipe's uneven events as a second swipe", () => {
		const uneven = [3, 8, 20, 35, 50, 30, 55, 28, 60, 45, 30, 20, 12, 7, 4, 2, 1];
		expect(steps({ events: uneven })).toEqual([1]);
	});

	it("doesn't move for a small nudge", () => {
		expect(steps({ events: [2, 4, 6, 5, 3, 2, 1] })).toEqual([]);
	});
});
