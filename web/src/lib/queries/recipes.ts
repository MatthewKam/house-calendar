// Recipes (docs/recipes.md): the family's recipe book.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RecipeImage } from '../api';
import type { Recipe, RecipeFields, SprigList } from '../types';
import type { RecipeShopping } from '../../../../shared/shopping.ts';
import { putBack, showNow, useLive } from './shared';
import { LISTS } from './lists';

/** The recipe book, newest first. */
export const useRecipes = () => useQuery({ queryKey: ['recipes'], queryFn: api.recipes });

/**
 * Whether recipes can be read from pictures or links here (Claude on the server). Its own key, not under
 * ['recipes']: changes to the book are shown straight away on every query under that key, and this isn't a list.
 */
export const useRecipeReading = () =>
	useQuery({ queryKey: ['recipe-reading'], queryFn: api.recipeReading, staleTime: Infinity });

/** Shopping together from a recipe: who is, and what's ticked by whom. Its own key, not under ['recipes'] (above). */
const shoppingKey = (id: string) => ['recipe-shopping', id];

/** Who's shopping from the recipe; checked every 30 seconds, so "Mom is shopping · Join" shows up. */
export const useRecipeShopping = (id: string) =>
	useQuery({ queryKey: shoppingKey(id), queryFn: () => api.recipeShopping(id), refetchInterval: 30_000 });

/** While shopping together from it here: the other phones' ticks as they're made. */
export const useLiveRecipeShopping = (id: string, on: boolean) =>
	useLive(
		on,
		shoppingKey(id),
		(stamp, signal) => api.liveRecipeShopping(id, stamp, signal),
		({ shopping, ticks }) => ({ shopping, ticks }),
	);

/** Turning it on or off here, and ticking an ingredient (shown straight away, as this device's). */
export function useRecipeShoppingActions(id: string) {
	const qc = useQueryClient();
	const key = shoppingKey(id);
	const replace = (state: RecipeShopping) => qc.setQueryData(key, state);
	return {
		shopping: useMutation({
			mutationKey: key,
			mutationFn: (on: boolean) => api.setRecipeShopping(id, on),
			onSuccess: replace,
		}),
		tick: useMutation({
			mutationKey: key,
			mutationFn: ({ index, done }: { index: number; done: boolean; by: string | null }) =>
				api.tickIngredient(id, index, done),
			onMutate: ({ index, done, by }) =>
				showNow(qc, [
					{
						key,
						apply: (state: RecipeShopping) => ({
							...state,
							ticks: done
								? [...state.ticks.filter((t) => t.index !== index), { index, by }]
								: state.ticks.filter((t) => t.index !== index),
						}),
					},
				]),
			onError: putBack(qc),
			onSuccess: replace,
		}),
	};
}

export function useRecipeActions() {
	const qc = useQueryClient();
	const refresh = () => qc.invalidateQueries({ queryKey: ['recipes'] });
	const book = (apply: (list: Recipe[]) => Recipe[]) => showNow(qc, [{ key: ['recipes'], apply }]);
	return {
		add: useMutation({
			mutationFn: ({ recipe, images, cover }: { recipe: RecipeFields; images: RecipeImage[]; cover: number | null }) =>
				api.addRecipe(recipe, images, cover),
			onSettled: refresh,
		}),
		update: useMutation({
			mutationFn: ({ id, recipe }: { id: string; recipe: RecipeFields }) => api.updateRecipe(id, recipe),
			onMutate: ({ id, recipe }) => book((list) => list.map((r) => (r.id === id ? { ...r, ...recipe } : r))),
			onError: putBack(qc),
			// Changing it clears any shopping ticks (they go by each ingredient's place).
			onSettled: (_r, _e, { id }) => {
				void qc.invalidateQueries({ queryKey: shoppingKey(id) });
				return refresh();
			},
		}),
		/** Photos: added (of the dish, or a step), the main one picked, one taken out. Each answers the recipe. */
		addImages: useMutation({
			mutationFn: ({ id, images, step }: { id: string; images: RecipeImage[]; step: number | null }) =>
				api.addRecipeImages(id, images, step),
			onSuccess: (r: Recipe) => book((list) => list.map((x) => (x.id === r.id ? r : x))),
			onSettled: refresh,
		}),
		setCover: useMutation({
			mutationFn: ({ id, imageId }: { id: string; imageId: string | null }) => api.setRecipeCover(id, imageId),
			onMutate: ({ id, imageId }) =>
				book((list) => list.map((r) => (r.id === id ? { ...r, coverId: imageId, noCover: imageId === null } : r))),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		removeImage: useMutation({
			mutationFn: ({ id, imageId }: { id: string; imageId: string }) => api.deleteRecipeImage(id, imageId),
			onMutate: ({ id, imageId }) =>
				book((list) =>
					list.map((r) =>
						r.id === id
							? {
									...r,
									images: r.images.filter((i) => i.id !== imageId),
									coverId: r.coverId === imageId ? null : r.coverId,
								}
							: r,
					),
				),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		/** A time it was cooked; someone's rating (shown straight away, the average worked out again). */
		logCook: useMutation({
			mutationFn: ({ id, minutes, note }: { id: string; minutes: number; note: string | null }) =>
				api.logRecipeCook(id, minutes, note),
			onSuccess: (r: Recipe) => book((list) => list.map((x) => (x.id === r.id ? r : x))),
			onSettled: refresh,
		}),
		/** The family's tags (shown straight away); notes after cooking (each answers the recipe). */
		setTags: useMutation({
			mutationFn: ({ id, tags }: { id: string; tags: string[] }) => api.setRecipeTags(id, tags),
			onMutate: ({ id, tags }) => book((list) => list.map((r) => (r.id === id ? { ...r, tags } : r))),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		addNote: useMutation({
			mutationFn: ({ id, text }: { id: string; text: string }) => api.addRecipeNote(id, text),
			onSuccess: (r: Recipe) => book((list) => list.map((x) => (x.id === r.id ? r : x))),
			onSettled: refresh,
		}),
		editNote: useMutation({
			mutationFn: ({ id, noteId, text }: { id: string; noteId: string; text: string }) =>
				api.editRecipeNote(id, noteId, text),
			onMutate: ({ id, noteId, text }) =>
				book((list) =>
					list.map((r) =>
						r.id === id ? { ...r, cookNotes: r.cookNotes.map((n) => (n.id === noteId ? { ...n, text } : n)) } : r,
					),
				),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		removeNote: useMutation({
			mutationFn: ({ id, noteId }: { id: string; noteId: string }) => api.deleteRecipeNote(id, noteId),
			onMutate: ({ id, noteId }) =>
				book((list) =>
					list.map((r) => (r.id === id ? { ...r, cookNotes: r.cookNotes.filter((n) => n.id !== noteId) } : r)),
				),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		rate: useMutation({
			mutationFn: ({ id, memberId, stars }: { id: string; memberId: string; stars: number | null }) =>
				api.rateRecipe(id, memberId, stars),
			onMutate: ({ id, memberId, stars }) =>
				book((list) =>
					list.map((r) => {
						if (r.id !== id) return r;
						const others = r.ratings.filter((x) => x.memberId !== memberId);
						const ratings = stars === null ? others : [...others, { memberId, stars }];
						const rating = ratings.length
							? Math.round((ratings.reduce((n, x) => n + x.stars, 0) / ratings.length) * 10) / 10
							: null;
						return { ...r, ratings, rating };
					}),
				),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		remove: useMutation({
			mutationFn: (id: string) => api.deleteRecipe(id),
			onMutate: (id) => book((list) => list.filter((r) => r.id !== id)),
			onError: putBack(qc),
			// Its plans (and their reminders) went with it.
			onSettled: () => {
				void refresh();
				void qc.invalidateQueries({ queryKey: ['meals'] });
				void qc.invalidateQueries({ queryKey: ['lists'] });
			},
		}),
	};
}

/**
 * What's missing for a recipe, onto the Groceries list (made if there isn't one): each a line, skipping
 * any already on it and not ticked off. Answers how many went on.
 */
export function useAddToGroceries() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: LISTS,
		mutationFn: async (lines: string[]) => {
			let lists = await api.lists();
			let groceries = lists.find((l) => /^grocer(y|ies)$/i.test(l.title.trim()));
			if (!groceries) {
				lists = await api.addList('Groceries');
				groceries = lists.find((l) => l.title === 'Groceries')!;
			}
			const already = new Set(groceries.items.filter((i) => !i.done).map((i) => i.title.toLowerCase()));
			const adding = lines.filter((l) => !already.has(l.toLowerCase()));
			let latest: SprigList[] = lists;
			for (const title of adding) latest = await api.addListItem(groceries.id, { title });
			qc.setQueryData(LISTS, latest);
			return adding.length;
		},
	});
}
