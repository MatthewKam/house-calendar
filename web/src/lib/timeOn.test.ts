import { describe, expect, it } from 'vitest';
import { timeOn } from './timegrid';
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
