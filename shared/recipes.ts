// Recipes (docs/recipes.md): what the server takes and gives back, written once. The server checks
// requests against these (server/schemas.ts schemaOf) and asks Claude for a draft in this shape; the web
// app imports the types only, so zod stays out of its bundle.

import { z } from 'zod';

/** The meal it's for (mainly dinner; themed breakfasts like Pancake Friday). */
export const Meal = z.enum(['dinner', 'breakfast', 'lunch', 'side', 'dessert', 'snack']);

/** One line of the ingredients: an amount (a number, so it can be scaled), its unit, and the thing. */
export const Ingredient = z.strictObject({
	/** The recipe's own heading it sits under ("For the marinade"), or null. */
	group: z.string().max(80).nullable(),
	/** 1.5 for "1 ½"; null for "salt to taste". */
	amount: z.number().min(0).max(100000).nullable(),
	/** "cup", "tbsp", "g", "clove"; null when it's a count ("2 eggs"). */
	unit: z.string().max(30).nullable(),
	/** "chicken thighs, boneless", "fresh ginger, grated". */
	item: z.string().min(1).max(200),
});

/** Something to do ahead: marinate overnight, thaw, soak, let the dough rise. */
export const PrepAhead = z.strictObject({
	what: z.string().min(1).max(200),
	/** How long before cooking it starts, in hours (overnight: 12). */
	hoursBefore: z.number().min(0).max(240),
});

/** What can be set on a recipe: everything but its pictures. Claude's draft is in this shape too. */
export const RecipeFields = z.strictObject({
	title: z.string().min(1).max(120),
	servings: z.int().min(1).max(100).nullable(),
	/** Start to table, and hands-on, in minutes. */
	totalMinutes: z.int().min(0).max(10000).nullable(),
	activeMinutes: z.int().min(0).max(10000).nullable(),
	ingredients: z.array(Ingredient).max(100),
	steps: z.array(z.string().min(1).max(2000)).max(60),
	notes: z.string().max(4000).nullable(),
	prepAhead: z.array(PrepAhead).max(10),
	/** For browsing: chicken, beef, pork, fish, shrimp, tofu, eggs, beans... */
	proteins: z.array(z.string().max(30)).max(6),
	/** The main vegetables. */
	vegetables: z.array(z.string().max(30)).max(10),
	/** Soup, pasta, sheet pan, salad, Mediterranean, Korean... */
	types: z.array(z.string().max(30)).max(8),
	meal: Meal,
	/** Where it came from (a link), or null. */
	sourceUrl: z.string().max(2000).nullable(),
});
export type RecipeFields = z.infer<typeof RecipeFields>;
export type Ingredient = z.infer<typeof Ingredient>;
export type Meal = z.infer<typeof Meal>;

/** A picture sent in, already shrunk by the app (2560px JPEG), as base64. */
export const ImageUpload = z.strictObject({
	mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
	data: z.string().max(12_000_000),
});

/** Read pictures or a link into a draft (POST /api/recipes/read). */
export const ReadRecipe = z.union([
	z.strictObject({ images: z.array(ImageUpload).min(1).max(6) }),
	z.strictObject({ url: z.url().max(2000) }),
]);

/** A new recipe (POST /api/recipes): its fields, its pictures, and which one is the cover (index). */
export const NewRecipe = z.strictObject({
	recipe: RecipeFields,
	images: z.array(ImageUpload).max(7),
	cover: z.int().min(0).nullable(),
});

/** A recipe as the app gets it. */
export interface Recipe extends RecipeFields {
	id: string;
	/** Its pictures (originals, and the cut-out cover if there is one), in order. */
	images: { id: string; url: string; thumbUrl: string }[];
	coverId: string | null;
	createdAt: string;
}

/** What reading gives back: the draft, and where in the pictures the dish's own photo is (to cut out as the cover). */
export interface RecipeDraft {
	recipe: RecipeFields;
	/** The picture (index) and the box (0 to 1 across and down) holding a photo of the dish; null with none. */
	cover: { image: number; x: number; y: number; width: number; height: number } | null;
	/** From a link: the page's own photo of the dish, to keep (the app shows it, then sends it back on save). */
	image: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null;
}
