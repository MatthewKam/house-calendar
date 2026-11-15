import { describe, expect, it } from 'vitest';
import { pageNumbers } from './pages';

describe('pageNumbers', () => {
	it('offers every page when there are few', () => {
		expect(pageNumbers(1, 0)).toEqual([0]);
		expect(pageNumbers(7, 3)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});
	it('offers the first, the last and those around this one, with gaps, when there are many', () => {
		expect(pageNumbers(12, 0)).toEqual([0, 1, null, 11]);
		expect(pageNumbers(12, 1)).toEqual([0, 1, 2, null, 11]);
		expect(pageNumbers(12, 5)).toEqual([0, null, 4, 5, 6, null, 11]);
		expect(pageNumbers(12, 10)).toEqual([0, null, 9, 10, 11]);
		expect(pageNumbers(12, 11)).toEqual([0, null, 10, 11]);
	});
});
