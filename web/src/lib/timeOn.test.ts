import { describe, expect, it } from 'vitest';
import { timeOn, weekBars } from './timegrid';
import type { CalEvent } from './types';

const ev = (start: string, end: string) => ({ start, end, allDay: false }) as CalEvent;
const day = (d: string) => new Date(`${d}T00:00:00`);

describe('a timed event over several days, on each of them', () => {
	// Friday 3 PM to Sunday 11 AM, local time.
	const camping = ev(new Date('2026-11-20T15:00:00').toISOString(), new Date('2026-11-22T11:00:00').toISOString());

	it('starts on the first day, fills the middle ones, and ends on the last', () => {
		expect(timeOn(camping, day('2026-11-20'))).toMatch(/^from 3:00\sPM$/);
		expect(timeOn(camping, day('2026-11-21'))).toBe('all day');
		expect(timeOn(camping, day('2026-11-22'))).toMatch(/^until 11:00\sAM$/);
	});
});

describe('the week strip', () => {
	const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 15 + i)); // Sun Nov 15 to Sat 21
	const allDay = (start: string, end: string, title = 'x') => ({ start, end, allDay: true, title }) as CalEvent;

	it('puts an event over several days as one bar over them, and a short one not at all', () => {
		const camping = {
			...ev(new Date(2026, 10, 20, 15).toISOString(), new Date(2026, 10, 22, 11).toISOString()),
			title: 'Camping',
		};
		const swim = {
			...ev(new Date(2026, 10, 17, 17).toISOString(), new Date(2026, 10, 17, 18).toISOString()),
			title: 'Swim',
		};
		const bars = weekBars([camping, swim], week);
		expect(bars).toHaveLength(1);
		// Friday and Saturday, going on past the week.
		expect(bars[0]).toMatchObject({ from: 5, to: 7, before: false, after: true });
	});

	it('covers the right days for an all-day event (its end date is the day after)', () => {
		const [bar] = weekBars([allDay('2026-11-16', '2026-11-19')], week);
		expect(bar).toMatchObject({ from: 1, to: 4, before: false, after: false });
	});

	it('stacks bars that share a day, and lets ones that don’t share a row', () => {
		const bars = weekBars(
			[
				allDay('2026-11-16', '2026-11-19', 'a'),
				allDay('2026-11-17', '2026-11-18', 'b'),
				allDay('2026-11-20', '2026-11-21', 'c'),
			],
			week,
		);
		const row = (t: string) => bars.find((b) => b.ev.title === t)!.row;
		expect([row('a'), row('b'), row('c')]).toEqual([0, 1, 0]);
	});
});
