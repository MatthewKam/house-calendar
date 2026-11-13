import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { schemaOf } from './schemas.ts';
import { AddImages, NewRecipe, ReadRecipe, RecipeFields, type Recipe, type RecipeDraft } from '../shared/recipes.ts';

// Recipes (docs/recipes.md): a recipe read from pictures (screenshots, a cookbook page) or a link by
// Claude, checked by a grown-up, then kept with its pictures. Reading saves nothing: the app shows the
// draft to fix first, then saves it (POST /api/recipes). Sent to Claude: only the pictures, or the page.

/** What Claude gives back: the recipe, and where the dish's own photo is in the pictures. */
const Read = z.object({
	recipe: RecipeFields,
	cover: z.object({ image: z.int(), x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable(),
});
type Read = z.infer<typeof Read>;

export type RecipeInput = { images: { mediaType: string; data: string }[] } | { page: { url: string; text: string } };
/** Reads pictures or a page into a recipe (Claude; replaced in tests). */
export type ReadRecipeFn = (input: RecipeInput) => Promise<Read>;

const SYSTEM = `You turn a recipe into a recipe card for a family's recipe book. The recipe comes as pictures (screenshots,
a photo of a cookbook page; a recipe can run across several pictures, in order) or as a web page.
- title: the dish's name, short.
- servings, totalMinutes (start to table) and activeMinutes (hands-on): as given, or a fair estimate; null when
  there's nothing to go on.
- ingredients: every one, in order. amount is a number (1 1/2 is 1.5, "a pinch" or "to taste" is null); unit is the
  measure as written short (cup, tbsp, tsp, g, oz, lb, clove, can), null for a count; item is the rest ("chicken
  thighs, boneless"). group: the recipe's own heading it's under ("For the marinade"), else null.
- steps: the method, one step per entry, in the recipe's words, without numbering.
- notes: tips, swaps and storing, short; null when there are none.
- prepAhead: things to start before the day: marinating, thawing from frozen, soaking beans, dough rising, chilling
  overnight. what says it plainly ("Marinate the chicken"); hoursBefore is how long ahead (overnight is 12).
  Leave out anything done on the day as part of cooking.
- proteins (chicken, beef, pork, lamb, fish, shrimp, tofu, eggs, beans), vegetables (the main ones), and types (a few
  of: soup, stew, pasta, rice, noodles, salad, sandwich, tacos, curry, stir-fry, sheet pan, slow cooker, grill,
  baking, and cuisines: Korean, Japanese, Chinese, Thai, Vietnamese, Indian, Mexican, Italian, Mediterranean,
  Middle Eastern, American, French): lowercase, from the recipe.
- meal: dinner unless it's clearly breakfast, lunch, a side, dessert or a snack.
- sourceUrl: null (it's filled in afterwards).
- cover: when a picture includes a photo of the finished dish (not text), which picture (0 is the first) and the box
  around that photo, as fractions of the picture's width and height (x and y its top left corner); null otherwise.
If it isn't a recipe, give a title saying so and leave the rest empty.`;

/** Claude: reads the pictures or the page. Sent to the Anthropic API. */
export function claudeReadRecipe(client = new Anthropic()): ReadRecipeFn {
	return async (input) => {
		const content =
			'images' in input
				? [
						...input.images.map((img) => ({
							type: 'image' as const,
							source: { type: 'base64' as const, media_type: img.mediaType as 'image/jpeg', data: img.data },
						})),
						{ type: 'text' as const, text: 'Make a recipe card from these pictures.' },
					]
				: `Make a recipe card from this page (${input.page.url}):\n\n${input.page.text}`;
		const response = await client.beta.messages.parse({
			model: 'claude-opus-5-5',
			max_tokens: 16000,
			output_config: { effort: 'low', format: betaZodOutputFormat(Read) },
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			system: SYSTEM,
			messages: [{ role: 'user', content }],
		});
		if (response.stop_reason === 'refusal') throw new Error("Sprig couldn't read that");
		if (!response.parsed_output) throw new Error(`Nothing came back (stop reason: ${response.stop_reason})`);
		return response.parsed_output;
	};
}

// ---- Reading a link ---------------------------------------------------------

/** No reaching into the home network or the server itself through a link. */
function privateAddress(ip: string) {
	if (isIP(ip) === 6) {
		const v = ip.toLowerCase();
		return (
			v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.')
		);
	}
	const [a, b] = ip.split('.').map(Number);
	return (
		a === 10 ||
		a === 127 ||
		a === 0 ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 169 && b === 254)
	);
}

/** The page at a link, if it's an ordinary public web page; else why not. */
type Resolve = (host: string) => Promise<{ address: string }[]>;
const dnsResolve: Resolve = (host) => lookup(host, { all: true });

async function fetchPublic(url: string, fetchImpl: typeof fetch, maxBytes: number, resolve: Resolve) {
	const u = new URL(url);
	if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('That link isn’t a web page');
	const addresses = await resolve(u.hostname).catch(() => []);
	if (!addresses.length) throw new Error('Couldn’t find that website');
	if (addresses.some((a) => privateAddress(a.address))) throw new Error('That link isn’t a public web page');
	const res = await fetchImpl(u, {
		headers: { 'user-agent': 'Mozilla/5.0 (Sprig recipe reader)' },
		redirect: 'follow',
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) throw new Error(`The page answered ${res.status}`);
	const body = Buffer.from(await res.arrayBuffer());
	if (body.length > maxBytes) throw new Error('That page is too big to read');
	return { body, type: res.headers.get('content-type') ?? '' };
}

/** A recipe a page describes for search engines (schema.org Recipe in JSON-LD), when it has one. */
function recipeData(html: string): Record<string, unknown> | null {
	for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
		try {
			const found = (function find(v: unknown): Record<string, unknown> | null {
				if (Array.isArray(v)) return v.map(find).find(Boolean) ?? null;
				if (v && typeof v === 'object') {
					const o = v as Record<string, unknown>;
					const type = o['@type'];
					if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return o;
					return find(o['@graph']);
				}
				return null;
			})(JSON.parse(m[1]));
			if (found) return found;
		} catch {
			// Not JSON after all: try the next one.
		}
	}
	return null;
}

/** A page's words, without its code, cut to a size worth reading. */
const pageText = (html: string) =>
	html
		.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 60_000);

/** The dish's photo a page names (its recipe data, else its preview image). */
function pagePhoto(data: Record<string, unknown> | null, html: string, base: string) {
	const pick = (v: unknown): string | null =>
		typeof v === 'string'
			? v
			: Array.isArray(v)
				? pick(v[0])
				: v && typeof v === 'object'
					? pick((v as { url?: unknown }).url)
					: null;
	const url =
		pick(data?.image) ?? /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
	try {
		return url ? new URL(url, base).toString() : null;
	} catch {
		return null;
	}
}

// ---- Routes -------------------------------------------------------------------

interface Row {
	id: string;
	data: string;
	cover_id: string | null;
	created_at: string;
}

export function registerRecipes(
	app: FastifyInstance,
	db: DB,
	opts: {
		/** Where pictures are kept; without it, recipes have none. */
		dir?: string;
		read?: ReadRecipeFn;
		/** How links are fetched and their sites' addresses found (replaced in tests). */
		fetchImpl?: typeof fetch;
		resolve?: Resolve;
	},
) {
	const { dir, read, fetchImpl = fetch, resolve = dnsResolve } = opts;
	const file = (id: string) => join(dir!, `${id}.jpg`);
	const images = (recipeId: string) =>
		(
			db.prepare('SELECT id, step FROM recipe_images WHERE recipe_id = ? ORDER BY sort_order').all(recipeId) as {
				id: string;
				step: number | null;
			}[]
		).map(({ id, step }) => ({ id, url: `/api/recipes/images/${id}`, thumbUrl: `/api/recipes/images/${id}`, step }));
	const toRecipe = (r: Row): Recipe => ({
		...(JSON.parse(r.data) as z.infer<typeof RecipeFields>),
		id: r.id,
		images: images(r.id),
		coverId: r.cover_id,
		createdAt: r.created_at,
	});
	const get = (id: string) => db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Row | undefined;

	// Whether reading works here (Claude needs a key), and where pictures go (without a folder, none).
	app.get('/api/recipes/reading', async () => ({ on: !!read, pictures: !!dir }));

	app.get('/api/recipes', async () =>
		(db.prepare('SELECT * FROM recipes ORDER BY created_at DESC').all() as Row[]).map(toRecipe),
	);

	// Pictures or a link into a draft to check: nothing is saved.
	app.post<{ Body: z.infer<typeof ReadRecipe> }>(
		'/api/recipes/read',
		{ bodyLimit: 40 * 1024 * 1024, schema: { body: schemaOf(ReadRecipe) } },
		async (req, reply): Promise<RecipeDraft | undefined> => {
			if (!read) return reply.code(503).send({ error: 'Reading recipes needs ANTHROPIC_API_KEY in .env' });
			try {
				if ('images' in req.body) {
					const found = await read({ images: req.body.images });
					return { recipe: { ...found.recipe, sourceUrl: null }, cover: found.cover, image: null };
				}
				const url = req.body.url;
				const page = await fetchPublic(url, fetchImpl, 5_000_000, resolve);
				const html = page.body.toString('utf8');
				const data = recipeData(html);
				// The recipe data when the page has it (clean and short), else the page's words.
				const found = await read({ page: { url, text: data ? JSON.stringify(data) : pageText(html) } });
				// The page's own photo of the dish, to keep with it.
				let image: RecipeDraft['image'] = null;
				const photo = pagePhoto(data, html, url);
				if (photo) {
					const got = await fetchPublic(photo, fetchImpl, 8_000_000, resolve).catch(() => null);
					const type = got?.type.split(';')[0] ?? '';
					if (got && (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp'))
						image = { mediaType: type, data: got.body.toString('base64') };
				}
				return { recipe: { ...found.recipe, sourceUrl: url }, cover: null, image };
			} catch (err) {
				req.log.warn({ err }, 'recipe reading failed');
				return reply.code(502).send({ error: (err as Error).message || "Couldn't read that recipe" });
			}
		},
	);

	// Keeps a checked recipe and its pictures (the cover: one of them, by index).
	app.post<{ Body: z.infer<typeof NewRecipe> }>(
		'/api/recipes',
		{ bodyLimit: 60 * 1024 * 1024, schema: { body: schemaOf(NewRecipe) } },
		async (req, reply) => {
			const { recipe, images: pictures, cover } = req.body;
			if (pictures.length && !dir)
				return reply.code(503).send({ error: 'Pictures need a photos folder on the server' });
			const id = randomUUID();
			const ids = pictures.map(() => randomUUID());
			// The folder is made with the first picture (not before: the album's folder stays as it was).
			if (pictures.length) mkdirSync(dir!, { recursive: true });
			pictures.forEach((p, i) => writeFileSync(file(ids[i]), Buffer.from(p.data, 'base64')));
			db.transaction(() => {
				db.prepare('INSERT INTO recipes (id, data, cover_id) VALUES (?, ?, ?)').run(
					id,
					JSON.stringify(recipe),
					cover !== null && ids[cover] ? ids[cover] : null,
				);
				const add = db.prepare('INSERT INTO recipe_images (id, recipe_id, sort_order) VALUES (?, ?, ?)');
				ids.forEach((imageId, i) => add.run(imageId, id, i));
			})();
			reply.code(201);
			return toRecipe(get(id)!);
		},
	);

	// Changes its fields (its pictures stay).
	app.put<{ Params: { id: string }; Body: z.infer<typeof RecipeFields> }>(
		'/api/recipes/:id',
		{ schema: { body: schemaOf(RecipeFields) } },
		async (req, reply) => {
			if (!get(req.params.id)) return reply.code(404).send({ error: 'Recipe not found' });
			db.prepare('UPDATE recipes SET data = ? WHERE id = ?').run(JSON.stringify(req.body), req.params.id);
			return toRecipe(get(req.params.id)!);
		},
	);

	app.delete<{ Params: { id: string } }>('/api/recipes/:id', async (req, reply) => {
		if (!get(req.params.id)) return reply.code(404).send({ error: 'Recipe not found' });
		const pictures = images(req.params.id);
		db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
		if (dir) for (const p of pictures) rmSync(file(p.id), { force: true });
		return reply.code(204).send();
	});

	// More photos: of the dish (step null), or of a step, how it should look by then.
	app.post<{ Params: { id: string }; Body: z.infer<typeof AddImages> }>(
		'/api/recipes/:id/images',
		{ bodyLimit: 60 * 1024 * 1024, schema: { body: schemaOf(AddImages) } },
		async (req, reply) => {
			if (!get(req.params.id)) return reply.code(404).send({ error: 'Recipe not found' });
			if (!dir) return reply.code(503).send({ error: 'Pictures need a photos folder on the server' });
			mkdirSync(dir, { recursive: true });
			const next = (
				db
					.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM recipe_images WHERE recipe_id = ?')
					.get(req.params.id) as {
					n: number;
				}
			).n;
			const add = db.prepare('INSERT INTO recipe_images (id, recipe_id, sort_order, step) VALUES (?, ?, ?, ?)');
			req.body.images.forEach((p, i) => {
				const imageId = randomUUID();
				writeFileSync(file(imageId), Buffer.from(p.data, 'base64'));
				add.run(imageId, req.params.id, next + i, req.body.step);
			});
			return toRecipe(get(req.params.id)!);
		},
	);

	// The main photo: one of its own (not a step's).
	app.put<{ Params: { id: string }; Body: { imageId: string } }>(
		'/api/recipes/:id/cover',
		{
			schema: {
				body: {
					type: 'object',
					required: ['imageId'],
					additionalProperties: false,
					properties: { imageId: { type: 'string' } },
				},
			},
		},
		async (req, reply) => {
			const ok = db
				.prepare('SELECT 1 FROM recipe_images WHERE id = ? AND recipe_id = ? AND step IS NULL')
				.get(req.body.imageId, req.params.id);
			if (!ok) return reply.code(404).send({ error: 'Picture not found' });
			db.prepare('UPDATE recipes SET cover_id = ? WHERE id = ?').run(req.body.imageId, req.params.id);
			return toRecipe(get(req.params.id)!);
		},
	);

	// A photo out (the main one: then none is picked, and the first shows).
	app.delete<{ Params: { id: string; imageId: string } }>('/api/recipes/:id/images/:imageId', async (req, reply) => {
		const res = db
			.prepare('DELETE FROM recipe_images WHERE id = ? AND recipe_id = ?')
			.run(req.params.imageId, req.params.id);
		if (!res.changes) return reply.code(404).send({ error: 'Picture not found' });
		db.prepare('UPDATE recipes SET cover_id = NULL WHERE id = ? AND cover_id = ?').run(
			req.params.id,
			req.params.imageId,
		);
		if (dir) rmSync(file(req.params.imageId), { force: true });
		return toRecipe(get(req.params.id)!);
	});

	app.get<{ Params: { id: string } }>('/api/recipes/images/:id', async (req, reply) => {
		const row = db.prepare('SELECT id FROM recipe_images WHERE id = ?').get(req.params.id);
		if (!row || !dir || !existsSync(file(req.params.id))) return reply.code(404).send({ error: 'Not found' });
		// Pictures never change once kept: cached for good.
		return reply
			.header('cache-control', 'private, max-age=31536000, immutable')
			.type('image/jpeg')
			.send(readFileSync(file(req.params.id)));
	});
}
