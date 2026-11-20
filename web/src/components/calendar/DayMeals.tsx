import { askToOpen, mealLabel, plannedOn, themesOn } from '../../lib/meals';
import { follow } from '../../lib/usePage';
import { useMeals, useRecipes } from '../../lib/queries';
import s from './DayMeals.module.css';

/**
 * A day's meals on the calendar (Plan ahead): "🍽️ Dinner: Korean beef", above its events, not one of them
 * (nothing in iCloud or Google). A tap opens the recipe. A themed day with nothing planned yet shows its name.
 */
export default function DayMeals({ day }: { day: string }) {
	const plans = useMeals().data;
	const recipes = useRecipes().data ?? [];
	const planned = plannedOn(plans, day).flatMap((m) => {
		const r = recipes.find((x) => x.id === m.recipeId);
		return r ? [{ id: m.id, meal: m.meal, recipe: r }] : [];
	});
	const themes = themesOn(plans, day).filter((t) => !planned.some((m) => m.meal === t.meal));
	if (!planned.length && !themes.length) return null;
	return (
		<ul className={s.meals} aria-label="Meals">
			{planned.map((m) => (
				<li key={m.id}>
					<button
						type="button"
						className={s.meal}
						onClick={(e) => {
							// Not the day itself (that opens the day panel).
							e.stopPropagation();
							askToOpen(m.recipe.id);
							// A link: the recipe shows ‹ Calendar (or ‹ Today) to come back.
							follow('recipes');
						}}
					>
						<span aria-hidden="true">🍽️</span> {mealLabel(m.meal)}: {m.recipe.title}
					</button>
				</li>
			))}
			{themes.map((t) => (
				<li key={t.id} className={s.theme}>
					<span aria-hidden="true">{t.emoji}</span> {t.name}
				</li>
			))}
		</ul>
	);
}
