import { useState } from 'react';
import { dayKey } from '../../lib/dates';
import { dayWord, mealLabel, MEALS, nextDays, plannedOn, suggestion, themesOn } from '../../lib/meals';
import { useMeals } from '../../lib/queries';
import { coverOf, mealPicture } from '../../lib/recipes';
import type { MealPlan, MealTheme, PlanMeal, Recipe } from '../../lib/types';
import { useNow } from '../../lib/useNow';
import AddRecipe from './AddRecipe';
import PlanIt from './PlanIt';
import ThemeForm from './ThemeForm';
import s from './Recipes.module.css';
import { Button } from '../ui/Button';

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
	new Date(2024, 0, 7 + i).toLocaleDateString([], { weekday: 'long' }),
);

/**
 * The Plan ahead tab: this week and next, a card a day wrapping onto rows. Each day shows what's planned
 * (tap to open, move or take off), a themed day's suggestion from the recipes (Use it, Another), and ＋ to
 * put a recipe on it; a day with nothing is one line. Below, the themed days, to add or change.
 */
export default function PlanAhead({
	recipes,
	parent,
	kinds,
	onOpen,
	onIdeas,
}: {
	recipes: Recipe[];
	parent: boolean;
	/** The recipes' kinds and tags, for a themed day to suggest from. */
	kinds: string[];
	onOpen: (recipeId: string) => void;
	/** A themed day with no recipe to suggest: Dish ideas, for its kind. */
	onIdeas: (kind: string) => void;
}) {
	const today = dayKey(useNow());
	const plans = useMeals().data;
	// Putting a recipe on a day (from a themed day: its suggestion, picked), or moving a planned one.
	const [planning, setPlanning] = useState<{ day: string; meal?: PlanMeal; plan?: MealPlan; recipe?: Recipe } | null>(
		null,
	);
	const [theme, setTheme] = useState<MealTheme | 'new' | null>(null);
	// Adding a new recipe, to put on this day.
	const [adding, setAdding] = useState<{ day: string; meal: PlanMeal } | null>(null);
	// Another: how far on each themed day's suggestion has stepped ("day|theme id").
	const [another, setAnother] = useState<Record<string, number>>({});
	const days = nextDays(today, 14);

	/** Dinner, unless it's planned already. */
	const firstFree = (planned: MealPlan[]) =>
		planned.some((m) => m.meal === 'dinner')
			? MEALS.find((x) => !planned.some((m) => m.meal === x.meal))?.meal
			: 'dinner';

	const dayCard = (day: string) => {
		const planned = plannedOn(plans, day);
		const themes = themesOn(plans, day).filter((t) => !planned.some((m) => m.meal === t.meal));
		const name = dayWord(day, today);
		// Nothing on it: one line, the day and ＋.
		if (!planned.length && !themes.length)
			return (
				<li key={day} className={`${s.weekDay} ${s.weekDayEmpty}`} aria-label={name}>
					<span className={s.weekDayName}>{name}</span>
					{parent && (
						<button
							type="button"
							className={s.weekAdd}
							aria-label={`Put a recipe on ${name}`}
							onClick={() => setPlanning({ day, meal: 'dinner' })}
						>
							＋
						</button>
					)}
				</li>
			);
		return (
			<li key={day} className={s.weekDay} aria-label={name}>
				<span className={s.weekDayHead}>
					<span className={s.weekDayName}>{name}</span>
					{parent && (
						<button
							type="button"
							className={s.weekAdd}
							aria-label={`Put a recipe on ${name}`}
							onClick={() => setPlanning({ day, meal: firstFree(planned) })}
						>
							＋
						</button>
					)}
				</span>
				{planned.map((m) => {
					const r = recipes.find((x) => x.id === m.recipeId);
					if (!r) return null;
					const cover = coverOf(r);
					return (
						<button
							key={m.id}
							type="button"
							className={s.weekMeal}
							onClick={() => (parent ? setPlanning({ day, plan: m }) : onOpen(r.id))}
						>
							{cover ? (
								<img src={cover.thumbUrl} alt="" />
							) : (
								<span className={s.defaultPicture} aria-hidden="true">
									{mealPicture(r.meal)}
								</span>
							)}
							<span className={s.weekMealText}>
								<span className={s.weekMealKind}>
									{mealLabel(m.meal)}
									{m.reminders.some((x) => !x.done) ? ' · ⏰' : ''}
								</span>
								{r.title}
							</span>
						</button>
					);
				})}
				{themes.map((t) => {
					const key = `${day}|${t.id}`;
					const pick = suggestion(t, recipes, plans, day, another[key] ?? 0);
					return (
						<div key={t.id} className={s.weekTheme}>
							<span className={s.weekThemeName}>
								<span aria-hidden="true">{t.emoji}</span> {t.name}
							</span>
							{pick ? (
								<>
									<span className={s.weekSuggest}>{pick.title}?</span>
									{parent && (
										<span className={s.weekThemeButtons}>
											<Button
												variant="quiet"
												size="sm"

												onClick={() => setPlanning({ day, meal: t.meal, recipe: pick })}
											>
												Use it
											</Button>
											<Button
												variant="quiet"
												size="sm"

												onClick={() => setAnother({ ...another, [key]: (another[key] ?? 0) + 1 })}
											>
												Another
											</Button>
										</span>
									)}
								</>
							) : (
								parent && (
									<Button variant="quiet" size="sm" onClick={() => onIdeas(t.from)}>
										✨ Ideas for {t.from}
									</Button>
								)
							)}
						</div>
					);
				})}
			</li>
		);
	};

	return (
		<div className={s.plan}>
			<section className={s.week} aria-label="This week">
				<h2 className={s.weekTitle}>This week</h2>
				<ol className={s.weekDays}>{days.slice(0, 7).map(dayCard)}</ol>
			</section>
			<section className={s.week} aria-label="Next week">
				<h2 className={s.weekTitle}>Next week</h2>
				<ol className={s.weekDays}>{days.slice(7).map(dayCard)}</ol>
			</section>
			<section className={s.week} aria-label="Themed days">
				<div className={s.sectionHead}>
					<h2 className={s.weekTitle}>Themed days</h2>
					{parent && (
						<Button size="sm" onClick={() => setTheme('new')}>
							＋ Themed day
						</Button>
					)}
				</div>
				{(plans?.themes ?? []).length === 0 ? (
					<p className={s.hint}>
						A day each week with a theme, like Pancake Friday: it suggests one of your recipes that fits.
					</p>
				) : (
					<ul className={s.themeList}>
						{plans!.themes.map((t) => (
							<li key={t.id}>
								<button type="button" className={s.themeRow} disabled={!parent} onClick={() => setTheme(t)}>
									<span className={s.themeEmoji} aria-hidden="true">
										{t.emoji}
									</span>
									<span className={s.weekMealText}>
										<b>{t.name}</b>
										<span className={s.weekMealKind}>
											Every {WEEKDAYS[t.weekday]}, {mealLabel(t.meal).toLowerCase()} · from “{t.from}”
										</span>
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</section>
			{planning && (
				<PlanIt
					day={planning.day}
					meal={planning.meal}
					plan={planning.plan}
					recipe={planning.recipe}
					onNewRecipe={() => {
						setAdding({ day: planning.day, meal: planning.meal ?? 'dinner' });
						setPlanning(null);
					}}
					onClose={() => setPlanning(null)}
					onOpenRecipe={(id) => {
						setPlanning(null);
						onOpen(id);
					}}
				/>
			)}
			{/* A new recipe for a day: added as with ＋ Recipe, then put on the day. */}
			{adding && (
				<AddRecipe
					onClose={() => setAdding(null)}
					onAdded={(r) => setPlanning({ day: adding.day, meal: adding.meal, recipe: r })}
				/>
			)}
			{theme && <ThemeForm theme={theme === 'new' ? undefined : theme} kinds={kinds} onClose={() => setTheme(null)} />}
		</div>
	);
}
