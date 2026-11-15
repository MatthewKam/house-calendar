// Plan ahead (docs/recipes.md): recipes on days and themed days. A plan's prep reminders are To do items,
// so a change here is a change to the lists too.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { MealThemeFields, PlanMeal, Plans } from '../types';
import { putBack, showNow } from './shared';

/** This device's time zone: when "8 PM the evening before" is. */
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const useMeals = () => useQuery({ queryKey: ['meals'], queryFn: api.meals });

export function useMealActions() {
	const qc = useQueryClient();
	const answered = (plans: Plans) => {
		qc.setQueryData(['meals'], plans);
		void qc.invalidateQueries({ queryKey: ['lists'] });
	};
	const plans = (apply: (p: Plans) => Plans) => showNow(qc, [{ key: ['meals'], apply }]);
	const refresh = () => qc.invalidateQueries({ queryKey: ['meals'] });
	return {
		plan: useMutation({
			mutationFn: (p: { day: string; meal: PlanMeal; recipeId: string }) => api.planMeal({ ...p, timeZone: zone() }),
			onSuccess: answered,
		}),
		move: useMutation({
			mutationFn: ({ id, day, meal }: { id: string; day: string; meal: PlanMeal }) =>
				api.moveMeal(id, { day, meal, timeZone: zone() }),
			onMutate: ({ id, day, meal }) =>
				plans((p) => ({ ...p, meals: p.meals.map((m) => (m.id === id ? { ...m, day, meal } : m)) })),
			onError: putBack(qc),
			onSuccess: answered,
			onSettled: refresh,
		}),
		unplan: useMutation({
			mutationFn: (id: string) => api.unplanMeal(id),
			onMutate: (id) => plans((p) => ({ ...p, meals: p.meals.filter((m) => m.id !== id) })),
			onError: putBack(qc),
			onSuccess: answered,
			onSettled: refresh,
		}),
		addTheme: useMutation({
			mutationFn: (t: MealThemeFields) => api.addMealTheme(t),
			onSuccess: answered,
		}),
		editTheme: useMutation({
			mutationFn: ({ id, theme }: { id: string; theme: MealThemeFields }) => api.editMealTheme(id, theme),
			onMutate: ({ id, theme }) =>
				plans((p) => ({ ...p, themes: p.themes.map((t) => (t.id === id ? { ...t, ...theme } : t)) })),
			onError: putBack(qc),
			onSuccess: answered,
			onSettled: refresh,
		}),
		removeTheme: useMutation({
			mutationFn: (id: string) => api.deleteMealTheme(id),
			onMutate: (id) => plans((p) => ({ ...p, themes: p.themes.filter((t) => t.id !== id) })),
			onError: putBack(qc),
			onSuccess: answered,
			onSettled: refresh,
		}),
	};
}
