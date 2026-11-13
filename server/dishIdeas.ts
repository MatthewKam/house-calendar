import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import { schemaOf } from './schemas.ts';
import { DishIdea, IdeasRequest, type RecipeFields } from '../shared/recipes.ts';

// Dish ideas (docs/recipes.md): for a night with no ideas, a few dishes to try, picked to suit the family
// (what's in their recipe book, what they rate highly) with something new mixed in, and never something
// anyone's allergic to. No recipes: the family searches for one they like and adds it to the book.
// Sent to Claude: the book's dishes, kinds and ratings, the household's allergies, and what's asked. No
// one's name.

const Ideas = z.object({ ideas: z.array(DishIdea) });

export interface IdeasInput {
	/** The book: each dish, its kinds and the family's rating (null: none yet). */
	book: { title: string; kinds: string[]; rating: number | null }[];
	/** Everyone's allergies, together. */
	allergies: string[];
	time: string | null;
	kind: string | null;
	ask: string | null;
	seen: string[];
}
/** Suggests dishes (Claude; replaced in tests). */
export type IdeasFn = (input: IdeasInput) => Promise<DishIdea[]>;

const SYSTEM = `You suggest dishes for a family to cook, for a night they're out of ideas. They'll search for a recipe for
each one they like, so give dishes, not recipes. The family has young kids (2 and 4), so lean toward dishes that
are family-friendly and doable on a weeknight, unless they ask for something else.
- Give 6 ideas. Mix: some like what they rate highly (similar flavours or kinds, not the same dishes), and at least
  two new to them (a kind or cuisine their book doesn't have yet).
- Never a dish already in their book, nor one in "seen" (shown already).
- Never anything with their allergies in it, including the usual hidden ones (pesto has nuts; soy sauce has
  wheat; Caesar dressing has fish and egg).
- Keep to the time and kind they ask for, and anything else they ask.
- name: the dish as it's usually called, short. emoji: one that pictures it. about: one plain line. minutes: a fair
  time start to table. why: one short line saying why it's for them ("You rate Korean beef highly", "Something
  new: Thai", "Quick for a busy night").`;

/** Claude: picks the dishes. Sent to the Anthropic API. */
export function claudeDishIdeas(client = new Anthropic()): IdeasFn {
	return async (input) => {
		const response = await client.beta.messages.parse({
			model: 'claude-opus-5-5',
			max_tokens: 4000,
			output_config: { effort: 'low', format: betaZodOutputFormat(Ideas) },
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			system: SYSTEM,
			messages: [{ role: 'user', content: JSON.stringify(input) }],
		});
		if (response.stop_reason === 'refusal') throw new Error("Couldn't think of any just now");
		if (!response.parsed_output) throw new Error(`Nothing came back (stop reason: ${response.stop_reason})`);
		return response.parsed_output.ideas;
	};
}

export function registerDishIdeas(app: FastifyInstance, db: DB, ideas?: IdeasFn) {
	app.post<{ Body: z.infer<typeof IdeasRequest> }>(
		'/api/recipes/ideas',
		{ schema: { body: schemaOf(IdeasRequest) } },
		async (req, reply) => {
			if (!ideas) return reply.code(503).send({ error: 'Dish ideas need ANTHROPIC_API_KEY in .env' });
			// The book: each dish with its kinds and the family's average rating.
			const rows = db.prepare('SELECT id, data FROM recipes').all() as { id: string; data: string }[];
			const average = db.prepare('SELECT AVG(stars) AS rating FROM recipe_ratings WHERE recipe_id = ?');
			const book = rows.map((r) => {
				const f = JSON.parse(r.data) as RecipeFields;
				const rating = (average.get(r.id) as { rating: number | null }).rating;
				return {
					title: f.title,
					kinds: [f.meal, ...f.proteins, ...f.types],
					rating: rating === null ? null : Math.round(rating * 10) / 10,
				};
			});
			const allergies = [
				...new Set(
					(db.prepare('SELECT allergies FROM members').all() as { allergies: string }[]).flatMap(
						(m) => JSON.parse(m.allergies || '[]') as string[],
					),
				),
			];
			try {
				const found = await ideas({ book, allergies, ...req.body });
				// Nothing already in the book or shown, whatever came back.
				const known = new Set([...book.map((b) => b.title), ...req.body.seen].map((t) => t.toLowerCase()));
				return { ideas: found.filter((i) => !known.has(i.name.toLowerCase())).slice(0, 8) };
			} catch (err) {
				req.log.warn({ err }, 'dish ideas failed');
				return reply.code(502).send({ error: "Couldn't think of any just now. Try again in a moment." });
			}
		},
	);
}
