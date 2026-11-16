import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import { schemaOf } from './schemas.ts';
import { LIVE_TIMES, liveAnswer, memberAsking, setShopping, shoppersOf, type LiveTimes } from './shopping.ts';
import { IngredientTick, Shopping, type LiveRecipeShopping, type RecipeShopping } from '../shared/shopping.ts';

// Shopping together from a recipe (shopping.ts): its ingredients ticked as they go in the basket, on
// each shopper's phone at once. Each recipe's ticks are its own (two recipes' onions aren't matched
// up). They're kept only while someone's shopping: once no one is, they're gone, so the next trip
// starts fresh. Changing the recipe clears them too (recipes.ts), as they're by each ingredient's place.

/** Who's shopping from the recipe and what's ticked; nobody shopping, nothing ticked (cleared). */
function stateOf(db: DB, recipeId: string): RecipeShopping {
	const shopping = shoppersOf(db, `recipe:${recipeId}`);
	if (!shopping.length) db.prepare('DELETE FROM recipe_ticks WHERE recipe_id = ?').run(recipeId);
	const ticks = db.prepare('SELECT idx, done_by FROM recipe_ticks WHERE recipe_id = ? ORDER BY idx').all(recipeId) as {
		idx: number;
		done_by: string | null;
	}[];
	return { shopping, ticks: ticks.map((t) => ({ index: t.idx, by: t.done_by })) };
}

export function registerRecipeShopping(app: FastifyInstance, db: DB, live: LiveTimes = LIVE_TIMES) {
	const exists = (id: string) => !!db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(id);

	app.get<{ Params: { id: string } }>('/api/recipes/:id/shopping', async (req, reply) => {
		if (!exists(req.params.id)) return reply.code(404).send({ error: 'Recipe not found' });
		return stateOf(db, req.params.id);
	});

	// On (for two hours, or until it's turned off), or off.
	app.put<{ Params: { id: string }; Body: Shopping }>(
		'/api/recipes/:id/shopping',
		{ schema: { body: schemaOf(Shopping) } },
		async (req, reply) => {
			if (!exists(req.params.id)) return reply.code(404).send({ error: 'Recipe not found' });
			setShopping(db, `recipe:${req.params.id}`, memberAsking(db, req.raw.viewer), req.body.on);
			return stateOf(db, req.params.id);
		},
	);

	// An ingredient in the basket (by whoever's asking), or taken back out. Only while someone's shopping.
	app.put<{ Params: { id: string; index: string }; Body: IngredientTick }>(
		'/api/recipes/:id/ticks/:index',
		{ schema: { body: schemaOf(IngredientTick) } },
		async (req, reply) => {
			if (!exists(req.params.id)) return reply.code(404).send({ error: 'Recipe not found' });
			const index = Number(req.params.index);
			if (!Number.isInteger(index) || index < 0) return reply.code(400).send({ error: 'Not an ingredient' });
			if (!stateOf(db, req.params.id).shopping.length)
				return reply.code(409).send({ error: 'Shopping together has ended. Turn it on again to share ticks.' });
			if (req.body.done)
				db.prepare('INSERT OR IGNORE INTO recipe_ticks (recipe_id, idx, done_by) VALUES (?, ?, ?)').run(
					req.params.id,
					index,
					memberAsking(db, req.raw.viewer),
				);
			else db.prepare('DELETE FROM recipe_ticks WHERE recipe_id = ? AND idx = ?').run(req.params.id, index);
			return stateOf(db, req.params.id);
		},
	);

	// As soon as it's not as the stamp says, or as it is after a while. Asked over and over while shopping.
	app.get<{ Params: { id: string }; Querystring: { stamp?: string } }>(
		'/api/recipes/:id/shopping/live',
		async (req, reply): Promise<LiveRecipeShopping | undefined> => {
			if (!exists(req.params.id)) return reply.code(404).send({ error: 'Recipe not found' });
			const { stamp, value } = await liveAnswer(() => stateOf(db, req.params.id), req.query.stamp, reply, live);
			return { stamp, ...value };
		},
	);
}
