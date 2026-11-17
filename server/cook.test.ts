import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { household } from './testing.ts';
import type { RecipeFields } from '../shared/recipes.ts';

const SOUP: RecipeFields = {
	title: 'Soup',
	servings: 4,
	totalMinutes: 30,
	activeMinutes: 10,
	ingredients: [
		{ group: null, amount: 1, unit: null, item: 'onion' },
		{ group: null, amount: 2, unit: 'cup', item: 'stock' },
	],
	steps: ['Chop.', 'Simmer.', 'Serve.'],
	notes: null,
	prepAhead: [],
	proteins: [],
	vegetables: [],
	types: [],
	meal: 'dinner',
	sourceUrl: null,
};
const PICTURE = { mediaType: 'image/jpeg' as const, data: Buffer.from('a jpeg').toString('base64') };
const started = (more: object = {}) => ({ startedAt: 1, prepped: [], steps: [], timers: [], doneAt: null, ...more });

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup() {
	dir = mkdtempSync(join(tmpdir(), 'cook-'));
	mkdirSync(join(dir, 'recipes'));
	const h = household([{ id: 'mom', name: 'Mom', color: '#ff0000' }], {
		photosDir: dir,
		liveLists: { waitMs: 300, lookMs: 20 },
	});
	let viewer: object | undefined = { role: 'guardian', memberId: 'mom', parent: true, holder: true, actor: 'mom' };
	h.app.addHook('onRequest', async (req) => {
		req.raw.viewer = viewer && ({ guardians: [], stillParent() {}, ...viewer } as never);
	});
	return { ...h, as: (v: object | undefined) => (viewer = v) };
}

describe('cooking together', () => {
	it('makes a link for a day, keeps each person’s own progress, and ends', async () => {
		const { app, call, as } = setup();
		const recipe = (await call('POST', '/api/recipes', { recipe: SOUP, images: [PICTURE], cover: 0 })).body;
		expect((await call('GET', `/api/recipes/${recipe.id}/cook`)).body).toEqual({ room: null });

		const made = await call('POST', `/api/recipes/${recipe.id}/cook`);
		expect(made.status).toBe(201);
		const { secret, until } = made.body.room;
		expect(secret).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(until - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
		// Asked again: the same link.
		expect((await call('POST', `/api/recipes/${recipe.id}/cook`)).body.room.secret).toBe(secret);

		// Mom cooks; Grandma (not in the family) joins with the link. Each has their own ticks and timers.
		await call('PUT', `/api/cook/${secret}/me`, { cookId: 'mom-phone', name: 'Me', progress: started({ steps: [0] }) });
		as(undefined);
		const opened = (await call('GET', `/api/cook/${secret}`)).body;
		expect(opened.recipe).toMatchObject({ title: 'Soup', coverUrl: expect.stringMatching(/^images\//) });
		expect((await app.inject({ url: `/api/cook/${secret}/${opened.recipe.coverUrl}` })).statusCode).toBe(200);
		expect((await app.inject({ url: `/api/cook/${secret}/images/someone-elses` })).statusCode).toBe(404);
		const timer = { id: 1, minutes: 20, endsAt: Date.now() + 1_200_000, name: 'Soup' };
		const both = (
			await call('PUT', `/api/cook/${secret}/me`, {
				cookId: 'grandma-ipad',
				name: ' Grandma ',
				progress: started({ prepped: [0, 1], timers: [timer] }),
			})
		).body.people;
		expect(both).toMatchObject([
			{ name: 'Mom', color: '#ff0000', memberId: 'mom', progress: { steps: [0], prepped: [] } },
			{ name: 'Grandma', memberId: null, progress: { steps: [], prepped: [0, 1], timers: [timer] } },
		]);
		expect((await call('PUT', `/api/cook/${secret}/me`, { cookId: 'x', name: '', progress: started() })).status).toBe(
			400,
		);

		// A kid's device doesn't start, change or end one.
		as({ role: 'kid', memberId: null, parent: false, holder: false, actor: null });
		expect((await call('DELETE', `/api/recipes/${recipe.id}/cook`)).status).toBe(403);

		// Longer, for a recipe over days.
		as({ role: 'guardian', memberId: 'mom', parent: true, holder: true, actor: 'mom' });
		const longer = (await call('PUT', `/api/recipes/${recipe.id}/cook`, { hours: 72 })).body.room;
		expect(longer.until - Date.now()).toBeGreaterThan(71.9 * 3_600_000);
		expect((await call('PUT', `/api/recipes/${recipe.id}/cook`, { hours: 500 })).status).toBe(400);

		await call('DELETE', `/api/recipes/${recipe.id}/cook`);
		expect((await call('GET', `/api/cook/${secret}`)).status).toBe(404);
		expect((await call('GET', `/api/recipes/${recipe.id}/cook`)).body).toEqual({ room: null });
	});

	it('answers live as soon as someone ticks', async () => {
		const { call } = setup();
		const recipe = (await call('POST', '/api/recipes', { recipe: SOUP, images: [], cover: null })).body;
		const { secret } = (await call('POST', `/api/recipes/${recipe.id}/cook`)).body.room;
		const first = (await call('GET', `/api/cook/${secret}/live`)).body;
		const asked = Date.now();
		const waiting = call('GET', `/api/cook/${secret}/live?stamp=${first.stamp}`);
		await new Promise((done) => setTimeout(done, 50));
		await call('PUT', `/api/cook/${secret}/me`, {
			cookId: 'mom-phone',
			name: 'Mom',
			progress: started({ steps: [1] }),
		});
		expect((await waiting).body.people[0].progress.steps).toEqual([1]);
		expect(Date.now() - asked).toBeLessThan(300);
	});
});
