import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';

describe('allergies', () => {
	it("keeps each person's allergies, each once, lowercase", async () => {
		const { call } = household([{ id: 'nolan', name: 'Nolan' }]);
		expect((await call('GET', '/api/members')).body[0].allergies).toEqual([]);
		const set = await call('PATCH', '/api/members/nolan', {
			allergies: ['Peanuts', 'peanuts ', 'sesame', 'Strawberries'],
		});
		expect(set.body.allergies).toEqual(['peanuts', 'sesame', 'strawberries']);
		// Changing something else leaves them be.
		expect((await call('PATCH', '/api/members/nolan', { name: 'Nolan K' })).body.allergies).toEqual([
			'peanuts',
			'sesame',
			'strawberries',
		]);
		expect((await call('PATCH', '/api/members/nolan', { allergies: [''] })).status).toBe(400);
		expect((await call('PATCH', '/api/members/nolan', { allergies: [] })).body.allergies).toEqual([]);
	});
});
