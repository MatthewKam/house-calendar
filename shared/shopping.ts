// Shopping together (server/shopping.ts), for a list or a recipe's ingredients: what the server takes
// and gives back, written once.

import { z } from 'zod';

/** Shopping together, or stopping (PUT /api/lists/:id/shopping, PUT /api/recipes/:id/shopping). */
export const Shopping = z.strictObject({ on: z.boolean() });

/** Ticking or unticking one of a recipe's ingredients while shopping together (PUT /api/recipes/:id/ticks/:index). */
export const IngredientTick = z.strictObject({ done: z.boolean() });

/** A recipe's ingredients as they're being shopped for: who's shopping, and what's ticked (by its place in the recipe) and by whom. */
export const RecipeShopping = z.object({
	/** Members' ids; null for a device with no one signed in. Nobody: Shopping together is off (and the ticks are gone). */
	shopping: z.array(z.string().nullable()),
	ticks: z.array(z.object({ index: z.number().int(), by: z.string().nullable() })),
});

/** The same, with a stamp of how it is: the same stamp, nothing has changed (GET /api/recipes/:id/shopping/live). */
export const LiveRecipeShopping = RecipeShopping.extend({ stamp: z.string() });

export type Shopping = z.infer<typeof Shopping>;
export type IngredientTick = z.infer<typeof IngredientTick>;
export type RecipeShopping = z.infer<typeof RecipeShopping>;
export type LiveRecipeShopping = z.infer<typeof LiveRecipeShopping>;
