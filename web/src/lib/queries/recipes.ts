// Recipes (docs/recipes.md): the family's recipe book.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RecipeImage } from '../api';
import type { Recipe, RecipeFields, SprigList } from '../types';
import { putBack, showNow } from './shared';

/** The recipe book, newest first. */
export const useRecipes = () => useQuery({ queryKey: ['recipes'], queryFn: api.recipes });

/** Whether recipes can be read from pictures or links here (Claude on the server). */
export const useRecipeReading = () =>
	useQuery({ queryKey: ['recipes', 'reading'], queryFn: api.recipeReading, staleTime: Infinity });

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
			onSettled: refresh,
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
			mutationFn: ({ id, minutes }: { id: string; minutes: number }) => api.logRecipeCook(id, minutes),
			onSuccess: (r: Recipe) => book((list) => list.map((x) => (x.id === r.id ? r : x))),
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
			onSettled: refresh,
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
			qc.setQueryData(['lists'], latest);
			return adding.length;
		},
	});
}
