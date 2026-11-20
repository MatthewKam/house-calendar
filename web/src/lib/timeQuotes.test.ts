import { describe, expect, it } from 'vitest';
import { TIME_LINES, timeLineFor } from './timeQuotes';

describe('the line once the day is over', () => {
	it('is the same all day, and changes from day to day', () => {
		expect(timeLineFor('2026-11-19')).toEqual(timeLineFor('2026-11-19'));
		const days = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'];
		expect(new Set(days.map(timeLineFor)).size).toBeGreaterThan(1);
	});
	it('has quotes with who said them and dad jokes without', () => {
		expect(TIME_LINES.some((l) => l.by)).toBe(true);
		expect(TIME_LINES.some((l) => !l.by)).toBe(true);
		expect(new Set(TIME_LINES.map((l) => l.text)).size).toBe(TIME_LINES.length);
	});
});
