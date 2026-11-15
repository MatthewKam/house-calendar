import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import { schemaOf } from './schemas.ts';
import { DishIdea, IdeasRequest, SurprisePick, SurpriseRequest, type RecipeFields } from '../shared/recipes.ts';

// Dish ideas (docs/recipes.md): for a night with no ideas, a few dishes to try, picked to suit the family
// (what's in their recipe book, what they rate highly) with something new mixed in, and never something
// anyone's allergic to. No recipes: the family searches for one they like and adds it to the book.
// Surprise me: one dish for today's weather, from their book or new to them (which, by chance each time).
// Sent to Claude: the book's dishes, kinds and ratings, the household's allergies, and what's asked (with
// Surprise me, the weather in words too). No one's name.

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

export interface SurpriseInput {
	/** From their book (one of `book`, by id) or new to them: decided by chance before asking. */
	from: 'book' | 'new';
	/** The book, in no order (shuffled each time, so the pick changes): each dish with its id and time too. */
	book: { id: string; title: string; kinds: string[]; rating: number | null; minutes: number | null }[];
	allergies: string[];
	time: string | null;
	kind: string | null;
	ask: string | null;
	weather: string | null;
	seen: string[];
}
/** Picks one dish (Claude; replaced in tests). */
export type SurpriseFn = (input: SurpriseInput) => Promise<SurprisePick>;

const SURPRISE = `You pick one dish for a family to cook today, suited to the weather: warm and hearty when it's cold or wet,
light and fresh (or no oven) when it's hot, anything when it's mild. The family has young kids (2 and 4), so keep it
family-friendly and doable on a weeknight unless they ask for something else.
- from "book": pick one of their book's recipes. The book is in no particular order: take the first one that suits the
  weather and what's asked, not the best-rated. Give its id as recipeId and its title as name.
- from "new": a dish not in their book, as a dish to search for (not a recipe); recipeId null. Something they might
  not think of, still suited to the weather.
- Never one in "seen" (picked already). Never anything with their allergies in it, including the usual hidden ones
  (pesto has nuts; soy sauce has wheat; Caesar dressing has fish and egg).
- Keep to the time and kind they ask for, and anything else they ask.
- emoji: one that pictures it. about: one plain line. minutes: a fair time start to table (a book recipe's own when
  it has one). why: one short line tying it to the weather ("Chilly and wet out: a warm bowl of soup"; "Hot out:
  nothing that needs the oven"), or, with no weather given, why it's a good pick today.`;

/** Claude: picks the one. Sent to the Anthropic API. */
export function claudeSurprise(client = new Anthropic()): SurpriseFn {
	return async (input) => {
		const response = await client.beta.messages.parse({
			model: 'claude-opus-5-5',
			max_tokens: 2000,
			output_config: { effort: 'low', format: betaZodOutputFormat(z.object({ pick: SurprisePick })) },
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			system: SURPRISE,
			messages: [{ role: 'user', content: JSON.stringify(input) }],
		});
		if (response.stop_reason === 'refusal') throw new Error("Couldn't pick one just now");
		if (!response.parsed_output) throw new Error(`Nothing came back (stop reason: ${response.stop_reason})`);
		return response.parsed_output.pick;
	};
}

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

/** The book: each dish with its id, kinds, time and the family's average rating. */
function bookOf(db: DB) {
	const rows = db.prepare('SELECT id, data FROM recipes').all() as { id: string; data: string }[];
	const average = db.prepare('SELECT AVG(stars) AS rating FROM recipe_ratings WHERE recipe_id = ?');
	return rows.map((r) => {
		const f = JSON.parse(r.data) as RecipeFields;
		const rating = (average.get(r.id) as { rating: number | null }).rating;
		return {
			id: r.id,
			title: f.title,
			kinds: [f.meal, ...f.proteins, ...f.types],
			rating: rating === null ? null : Math.round(rating * 10) / 10,
			minutes: f.totalMinutes,
		};
	});
}

/** Everyone's allergies, together. */
const allergiesOf = (db: DB) => [
	...new Set(
		(db.prepare('SELECT allergies FROM members').all() as { allergies: string }[]).flatMap(
			(m) => JSON.parse(m.allergies || '[]') as string[],
		),
	),
];

/** Shuffled (Fisher–Yates), with `random` from 0 to 1. */
function shuffled<T>(list: T[], random: () => number) {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

export function registerDishIdeas(
	app: FastifyInstance,
	db: DB,
	ideas?: IdeasFn,
	surprise?: SurpriseFn,
	/** Chance, from 0 to 1 (replaced in tests). */
	random: () => number = Math.random,
) {
	app.post<{ Body: z.infer<typeof IdeasRequest> }>(
		'/api/recipes/ideas',
		{ schema: { body: schemaOf(IdeasRequest) } },
		async (req, reply) => {
			if (!ideas) return reply.code(503).send({ error: 'Dish ideas need ANTHROPIC_API_KEY in .env' });
			const book = bookOf(db).map(({ title, kinds, rating }) => ({ title, kinds, rating }));
			try {
				const found = await ideas({ book, allergies: allergiesOf(db), ...req.body });
				// Nothing already in the book or shown, whatever came back.
				const known = new Set([...book.map((b) => b.title), ...req.body.seen].map((t) => t.toLowerCase()));
				return { ideas: found.filter((i) => !known.has(i.name.toLowerCase())).slice(0, 8) };
			} catch (err) {
				req.log.warn({ err }, 'dish ideas failed');
				return reply.code(502).send({ error: "Couldn't think of any just now. Try again in a moment." });
			}
		},
	);

	// One dish for today's weather: from the book or new, by chance (new when the book has none left to pick).
	app.post<{ Body: z.infer<typeof SurpriseRequest> }>(
		'/api/recipes/surprise',
		{ schema: { body: schemaOf(SurpriseRequest) } },
		async (req, reply) => {
			if (!surprise) return reply.code(503).send({ error: 'Surprise me needs ANTHROPIC_API_KEY in .env' });
			const seen = new Set(req.body.seen.map((t) => t.toLowerCase()));
			const book = shuffled(bookOf(db), random);
			const left = book.filter((b) => !seen.has(b.title.toLowerCase()));
			const from = left.length && random() < 0.5 ? 'book' : 'new';
			try {
				const pick = await surprise({
					from,
					book: from === 'book' ? left : book,
					allergies: allergiesOf(db),
					...req.body,
				});
				// A book recipe only by an id that's really there (or its title); a "new" one already in the book is that one.
				const mine =
					book.find((b) => b.id === pick.recipeId) ??
					book.find((b) => b.title.toLowerCase() === pick.name.toLowerCase());
				return {
					pick: { ...pick, name: mine?.title ?? pick.name, recipeId: mine?.id ?? null },
				};
			} catch (err) {
				req.log.warn({ err }, 'surprise me failed');
				return reply.code(502).send({ error: "Couldn't pick one just now. Try again in a moment." });
			}
		},
	);
}
