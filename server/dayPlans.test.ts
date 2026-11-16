import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';

const BIRTHDAY = 'birthday:alex';
const url = (key: string) => `/api/day-plans/${encodeURIComponent(key)}`;

describe('day plans', () => {
	it('keeps a note on a day, and an empty one takes it off', async () => {
		const { call } = household([{ id: 'alex', name: 'Alex' }]);
		expect((await call('GET', '/api/day-plans')).body).toEqual({ notes: {}, lists: {} });
		const day = 'date:2026-11-21';
		expect((await call('PUT', `${url(day)}/note`, { note: '  Bring the cooler  ' })).body.notes).toEqual({
			[day]: 'Bring the cooler',
		});
		await call('PUT', `${url(BIRTHDAY)}/note`, { note: 'Likes tulips, not roses' });
		await call('PUT', `${url(day)}/note`, { note: ' ' });
		expect((await call('GET', '/api/day-plans')).body.notes).toEqual({ [BIRTHDAY]: 'Likes tulips, not roses' });
		expect((await call('PUT', `${url('someday')}/note`, { note: 'x' })).status).toBe(400);
	});

	it('keeps a list every year, with ticks for each year', async () => {
		const { call } = household([{ id: 'alex', name: 'Alex' }]);
		const saved = (
			await call('PUT', `${url(BIRTHDAY)}/list`, {
				items: [{ title: 'Cake', picture: '🎂' }, { title: 'Balloons' }, { title: ' ' }],
			})
		).body.lists[BIRTHDAY];
		expect(saved).toMatchObject([
			{ title: 'Cake', picture: '🎂', ticked: [] },
			{ title: 'Balloons', picture: null, ticked: [] },
		]);
		const [cake, balloons] = saved;
		const tick = (id: string, day: string, done = true) => call('PUT', `${url(BIRTHDAY)}/list/${id}`, { day, done });
		await tick(cake.id, '2026-11-26');
		expect((await tick(cake.id, '2027-11-26')).body.lists[BIRTHDAY][0].ticked).toEqual(['2026-11-26', '2027-11-26']);
		await tick(cake.id, '2027-11-26', false);
		expect((await tick('nope', '2026-11-26')).status).toBe(404);

		// Reordered, renamed and one taken off: the kept one keeps its ticks.
		const changed = (
			await call('PUT', `${url(BIRTHDAY)}/list`, {
				items: [{ title: 'Candles' }, { id: cake.id, title: 'Chocolate cake', picture: '🎂' }],
			})
		).body.lists[BIRTHDAY];
		expect(changed).toMatchObject([
			{ title: 'Candles', ticked: [] },
			{ id: cake.id, title: 'Chocolate cake', ticked: ['2026-11-26'] },
		]);
		expect(changed.some((x: { id: string }) => x.id === balloons.id)).toBe(false);
	});

	it("isn't for a kid's own device", async () => {
		const { app, call } = household([{ id: 'kid', name: 'Kid' }]);
		let viewer: object | undefined = undefined;
		app.addHook('onRequest', async (req) => {
			req.raw.viewer = viewer as never;
		});
		await call('PUT', `${url(BIRTHDAY)}/note`, { note: 'A bike!' });
		viewer = { role: 'kid', memberId: 'kid', parent: false, holder: false, actor: 'kid' };
		expect((await call('GET', '/api/day-plans')).status).toBe(403);
		expect((await call('PUT', `${url(BIRTHDAY)}/note`, { note: 'x' })).status).toBe(403);
		// The wall, locked: a parent's PIN first.
		viewer = { role: 'wall', memberId: null, parent: false, holder: false, actor: 'wall' };
		expect((await call('PUT', `${url(BIRTHDAY)}/note`, { note: 'x' })).status).toBe(403);
	});
});
