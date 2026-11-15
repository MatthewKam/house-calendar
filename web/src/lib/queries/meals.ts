// Plan ahead (docs/recipes.md): recipes on days and themed days. A plan's prep reminders are To do items,
// so a change here is a change to the lists too.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { zone } from '../meals';
import type { MealThemeFields, PlanMeal, Plans, Reminder, SprigList } from '../types';
import { putBack, showNow } from './shared';

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
			mutationFn: (p: { day: string; meal: PlanMeal; recipeId: string; reminders: Reminder[] }) =>
				api.planMeal({ ...p, timeZone: zone() }),
			onSuccess: answered,
		}),
		move: useMutation({
			mutationFn: ({ id, day, meal, reminders }: { id: string; day: string; meal: PlanMeal; reminders: Reminder[] }) =>
				api.moveMeal(id, { day, meal, timeZone: zone(), reminders }),
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

/**
 * Just remind me: reminders on To do (made if there isn't one) for a recipe's prep, without planning the
 * meal. Answers how many went on.
 */
export function useRemindPrep() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (items: { title: string; due: string }[]) => {
			let lists = await api.lists();
			let toDo = lists.find((l) => /^to ?do$/i.test(l.title.trim()));
			if (!toDo) {
				lists = await api.addList('To do');
				toDo = lists.find((l) => l.title === 'To do')!;
			}
			let latest: SprigList[] = lists;
			for (const item of items) latest = await api.addListItem(toDo.id, item);
			qc.setQueryData(['lists'], latest);
			return items.length;
		},
	});
}
