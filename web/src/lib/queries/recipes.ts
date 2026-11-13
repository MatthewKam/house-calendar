// Recipes (docs/recipes.md): the family's recipe book.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RecipeImage } from '../api';
import type { Recipe, RecipeFields } from '../types';
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
		remove: useMutation({
			mutationFn: (id: string) => api.deleteRecipe(id),
			onMutate: (id) => book((list) => list.filter((r) => r.id !== id)),
			onError: putBack(qc),
			onSettled: refresh,
		}),
	};
}
