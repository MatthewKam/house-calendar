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
	// A web address only (never javascript: or the like): it's shown as a link.
	sourceUrl: z
		.string()
		.max(2000)
		.regex(/^https?:\/\//i)
		.nullable(),
});
export type RecipeFields = z.infer<typeof RecipeFields>;
export type Ingredient = z.infer<typeof Ingredient>;
export type Meal = z.infer<typeof Meal>;
export type PrepAhead = z.infer<typeof PrepAhead>;

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

/** Photos added to a recipe later (POST /api/recipes/:id/images): of the dish, or of a step (its place, from 0). */
export const AddImages = z.strictObject({
	images: z.array(ImageUpload).min(1).max(6),
	step: z.int().min(0).max(59).nullable(),
});

/** A recipe as the app gets it. */
export interface Recipe extends RecipeFields {
	id: string;
	/** Its pictures, in order: the recipe's own (step null), and photos of its steps (the step's place). */
	images: { id: string; url: string; thumbUrl: string; step: number | null }[];
	/** The main photo; null: none picked (the first of its own shows). */
	coverId: string | null;
	/** Picked to have no main photo: a default picture shows instead. */
	noCover: boolean;
	/** Times it's been cooked (saved after Done cooking): how many, how long on average, and the last. */
	cooked: { times: number; averageMinutes: number | null; lastAt: string | null };
	/** Each person's rating, out of 5, and the family's average (null: none yet). */
	ratings: { memberId: string; stars: number }[];
	rating: number | null;
	/** The family's own tags ("Kid approved", "Freezes well", their own), as written. */
	tags: string[];
	/** Notes after cooking ("Used half the sugar"), newest first: who wrote each (null: not known), and when. */
	cookNotes: CookNote[];
	createdAt: string;
}

export interface CookNote {
	id: string;
	text: string;
	memberId: string | null;
	writtenAt: string;
}

/** The family's tags on a recipe (PUT /api/recipes/:id/tags), all of them. */
export const RecipeTags = z.strictObject({
	tags: z.array(z.string().min(1).max(30)).max(12),
});

/** The main photo (PUT /api/recipes/:id/cover): one of the recipe's own, or none (a default picture shows). */
export const RecipeCover = z.strictObject({ imageId: z.string().nullable() });

/** Someone's rating (PUT /api/recipes/:id/ratings/:memberId): out of 5, or null to take it back. */
export const RecipeRating = z.strictObject({ stars: z.int().min(1).max(5).nullable() });

/** A note after cooking, new or changed (POST /api/recipes/:id/notes, PUT .../notes/:noteId). */
export const CookNoteText = z.strictObject({
	text: z.string().min(1).max(1000),
});

/** A time it was cooked (POST /api/recipes/:id/cooks): how long it took, and a note for next time, if any. */
export const NewCook = z.strictObject({
	minutes: z.int().min(1).max(1440),
	note: z.string().max(1000).nullable().optional(),
});

/** What reading gives back: the draft, and where in the pictures the dish's own photo is (to cut out as the cover). */
export interface RecipeDraft {
	recipe: RecipeFields;
	/** The picture (index) and the box (0 to 1 across and down) holding a photo of the dish; null with none. */
	cover: { image: number; x: number; y: number; width: number; height: number } | null;
	/** From a link: the page's own photo of the dish, to keep (the app shows it, then sends it back on save). */
	image: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null;
}

/** Asking for dish ideas (POST /api/recipes/ideas): the time there is, a kind, anything else, and what's been shown already. */
export const IdeasRequest = z.strictObject({
	time: z.string().max(40).nullable(),
	kind: z.string().max(40).nullable(),
	ask: z.string().max(200).nullable(),
	/** Ideas already shown this time, so More ideas brings new ones. */
	seen: z.array(z.string().max(120)).max(60),
});

/** A dish to try (no recipe: the family searches for one they like). */
export const DishIdea = z.strictObject({
	name: z.string().min(1).max(120),
	/** A picture of its kind (🍜, 🌮, 🥘). */
	emoji: z.string().max(16),
	/** What it is, in a line. */
	about: z.string().max(300),
	/** A rough time, start to table. */
	minutes: z.int().min(0).max(1440).nullable(),
	/** Why it's suggested: "You rate Korean beef highly", "Something new: Thai". */
	why: z.string().max(200),
});
export type DishIdea = z.infer<typeof DishIdea>;

/**
 * Surprise me (POST /api/recipes/surprise): one dish for today's weather, from their book or new to them.
 * What's narrowed as for Dish ideas, the weather in words as the app shows it ("Feels like 48°F, rain
 * likely"), and what's been picked already this time.
 */
export const SurpriseRequest = z.strictObject({
	time: z.string().max(40).nullable(),
	kind: z.string().max(40).nullable(),
	ask: z.string().max(200).nullable(),
	weather: z.string().max(300).nullable(),
	seen: z.array(z.string().max(120)).max(60),
});

/** The pick: a dish idea, and the recipe in their book it is (null: something new, to search for). */
export const SurprisePick = DishIdea.extend({ recipeId: z.string().nullable() });
export type SurprisePick = z.infer<typeof SurprisePick>;
