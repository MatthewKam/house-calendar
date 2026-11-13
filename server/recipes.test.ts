import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { household } from './testing.ts';
import type { RecipeInput } from './recipes.ts';
import type { RecipeFields } from '../shared/recipes.ts';

const BULGOGI: RecipeFields = {
	title: 'Bulgogi',
	servings: 4,
	totalMinutes: 40,
	activeMinutes: 20,
	ingredients: [
		{ group: 'For the marinade', amount: 0.25, unit: 'cup', item: 'soy sauce' },
		{ group: null, amount: 1.5, unit: 'lb', item: 'ribeye, thinly sliced' },
	],
	steps: ['Mix the marinade.', 'Marinate the beef.', 'Sear in a hot pan.'],
	notes: null,
	prepAhead: [{ what: 'Marinate the beef', hoursBefore: 4 }],
	proteins: ['beef'],
	vegetables: ['onion'],
	types: ['korean'],
	meal: 'dinner',
	sourceUrl: null,
};
// A tiny JPEG's worth of bytes (the server keeps what the app sends; it's shrunk there).
const PICTURE = { mediaType: 'image/jpeg' as const, data: Buffer.from('a jpeg').toString('base64') };

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup() {
	dir = mkdtempSync(join(tmpdir(), 'recipes-'));
	const seen: RecipeInput[] = [];
	const fetched: string[] = [];
	const page = `<html><head><meta property="og:image" content="/dish.jpg">
		<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Bulgogi","recipeIngredient":["1/4 cup soy sauce"]}]}</script>
		</head><body><p>My life story…</p></body></html>`;
	const h = household([], {
		photosDir: dir,
		readRecipe: async (input) => {
			seen.push(input);
			return {
				recipe: BULGOGI,
				cover: 'images' in input ? { image: 0, x: 0.1, y: 0.2, width: 0.5, height: 0.4 } : null,
			};
		},
		recipeFetch: (async (url: URL | string) => {
			fetched.push(String(url));
			return String(url).endsWith('/dish.jpg')
				? new Response(Buffer.from('dish'), { headers: { 'content-type': 'image/jpeg' } })
				: new Response(page, { headers: { 'content-type': 'text/html' } });
		}) as unknown as typeof fetch,
		// A public site, and one at home.
		recipeResolve: async (host) => [{ address: host === 'router.home' ? '192.168.1.1' : '93.184.216.34' }],
	});
	return { ...h, seen, fetched };
}

describe('recipes', () => {
	it('reads pictures into a draft, then keeps the checked recipe with its pictures', async () => {
		const { call, seen } = setup();
		const draft = await call('POST', '/api/recipes/read', { images: [PICTURE, PICTURE] });
		expect(draft.body).toEqual({
			recipe: BULGOGI,
			cover: { image: 0, x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
			image: null,
		});
		expect(seen[0]).toEqual({ images: [PICTURE, PICTURE] });
		// Reading keeps nothing.
		expect((await call('GET', '/api/recipes')).body).toEqual([]);

		// Saved with both pictures and a cut-out cover (the third).
		const saved = await call('POST', '/api/recipes', {
			recipe: BULGOGI,
			images: [PICTURE, PICTURE, PICTURE],
			cover: 2,
		});
		expect(saved.status).toBe(201);
		expect(saved.body).toMatchObject({ title: 'Bulgogi', coverId: saved.body.images[2].id });
		expect(saved.body.images).toHaveLength(3);
		const picture = saved.body.images[0];
		expect(existsSync(join(dir, 'recipes', `${picture.id}.jpg`))).toBe(true);
		expect((await call('GET', '/api/recipes')).body.map((r: { title: string }) => r.title)).toEqual(['Bulgogi']);

		// Changed: its words, not its pictures.
		const changed = await call('PUT', `/api/recipes/${saved.body.id}`, {
			...BULGOGI,
			title: 'Beef bulgogi',
			servings: 6,
		});
		expect(changed.body).toMatchObject({ title: 'Beef bulgogi', servings: 6, coverId: saved.body.coverId });
		expect(changed.body.images).toHaveLength(3);

		// Deleted, with its pictures.
		expect((await call('DELETE', `/api/recipes/${saved.body.id}`)).status).toBe(204);
		expect(existsSync(join(dir, 'recipes', `${picture.id}.jpg`))).toBe(false);
		expect((await call('GET', '/api/recipes')).body).toEqual([]);
	});

	it("reads a link from the page's recipe data, keeping its photo, and never a home address", async () => {
		const { call, seen, fetched } = setup();
		const draft = await call('POST', '/api/recipes/read', { url: 'https://food.example/bulgogi' });
		expect(draft.status).toBe(200);
		expect(draft.body.recipe.sourceUrl).toBe('https://food.example/bulgogi');
		// Claude got the recipe data, not the life story.
		const text = (seen[0] as { page: { text: string } }).page.text;
		expect(text).toContain('"recipeIngredient"');
		expect(text).not.toContain('life story');
		// The page's photo came along.
		expect(fetched).toContain('https://food.example/dish.jpg');
		expect(draft.body.image).toEqual({ mediaType: 'image/jpeg', data: Buffer.from('dish').toString('base64') });

		const home = await call('POST', '/api/recipes/read', { url: 'http://router.home/admin' });
		expect(home.status).toBe(502);
		expect(home.body.error).toMatch(/public web page/);
		expect((await call('POST', '/api/recipes/read', { url: 'not a link' })).status).toBe(400);
	});

	it('adds photos of the dish and of a step, picks the main one, and takes one out', async () => {
		const { call } = setup();
		const saved = (await call('POST', '/api/recipes', { recipe: BULGOGI, images: [PICTURE], cover: null })).body;
		// A photo of step 2 (how the beef should look by then), and two more of the dish.
		const withStep = await call('POST', `/api/recipes/${saved.id}/images`, { images: [PICTURE], step: 2 });
		expect(withStep.body.images.map((i: { step: number | null }) => i.step)).toEqual([null, 2]);
		const more = (await call('POST', `/api/recipes/${saved.id}/images`, { images: [PICTURE, PICTURE], step: null }))
			.body;
		expect(more.images.map((i: { step: number | null }) => i.step)).toEqual([null, 2, null, null]);

		// The main photo: one of the dish's, never a step's.
		const dish = more.images[3].id;
		expect((await call('PUT', `/api/recipes/${saved.id}/cover`, { imageId: more.images[1].id })).status).toBe(404);
		expect((await call('PUT', `/api/recipes/${saved.id}/cover`, { imageId: dish })).body.coverId).toBe(dish);

		// Taken out: the main one goes back to none picked.
		const gone = (await call('DELETE', `/api/recipes/${saved.id}/images/${dish}`)).body;
		expect([gone.coverId, gone.images.length]).toEqual([null, 3]);
		expect(existsSync(join(dir, 'recipes', `${dish}.jpg`))).toBe(false);
	});

	it('keeps what was left empty as empty (not 0 or "")', async () => {
		const { call } = setup();
		const salt = { group: null, amount: null, unit: null, item: 'salt' };
		const saved = await call('POST', '/api/recipes', {
			recipe: { ...BULGOGI, servings: null, totalMinutes: null, notes: null, ingredients: [salt] },
			images: [],
			cover: null,
		});
		expect(saved.body).toMatchObject({ servings: null, totalMinutes: null, notes: null, ingredients: [salt] });
	});

	it('says so when reading is off, and checks what it keeps', async () => {
		dir = mkdtempSync(join(tmpdir(), 'recipes-'));
		const { call } = household([], { photosDir: dir });
		expect((await call('GET', '/api/recipes/reading')).body).toEqual({ on: false, pictures: true });
		expect((await call('POST', '/api/recipes/read', { images: [PICTURE] })).status).toBe(503);
		expect(
			(await call('POST', '/api/recipes', { recipe: { ...BULGOGI, title: '' }, images: [], cover: null })).status,
		).toBe(400);
		expect((await call('PUT', '/api/recipes/nope', BULGOGI)).status).toBe(404);
	});
});
