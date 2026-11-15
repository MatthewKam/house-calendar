import { useState } from 'react';
import { dayKey } from '../../lib/dates';
import { dayWord, mealLabel, MEALS, nextDays, plannedOn, suggestion, themesOn } from '../../lib/meals';
import { useMealActions, useMeals } from '../../lib/queries';
import { coverOf, mealPicture } from '../../lib/recipes';
import type { MealPlan, MealTheme, PlanMeal, Recipe } from '../../lib/types';
import { useNow } from '../../lib/useNow';
import PlanIt from './PlanIt';
import ThemeForm from './ThemeForm';
import s from './Recipes.module.css';

/**
 * The week ahead on the Recipes page: what's planned each day (tap to open, move or take off), themed
 * days with their suggestion from the book (Use it, Another), and ＋ to plan an empty day.
 */
export default function ThisWeek({
	recipes,
	parent,
	kinds,
	onOpen,
	onIdeas,
}: {
	recipes: Recipe[];
	parent: boolean;
	/** The book's kinds and tags, for a themed day to suggest from. */
	kinds: string[];
	onOpen: (recipeId: string) => void;
	/** A themed day with nothing in the book to suggest: Dish ideas, for its kind. */
	onIdeas: (kind: string) => void;
}) {
	const today = dayKey(useNow());
	const plans = useMeals().data;
	const { plan } = useMealActions();
	const [planning, setPlanning] = useState<{ day: string; meal?: PlanMeal; plan?: MealPlan } | null>(null);
	const [theme, setTheme] = useState<MealTheme | 'new' | null>(null);
	// Another: how far on each themed day's suggestion has stepped ("day|theme id").
	const [another, setAnother] = useState<Record<string, number>>({});

	return (
		<section className={s.week} aria-label="This week">
			<div className={s.sectionHead}>
				<h2 className={s.weekTitle}>This week</h2>
				{parent && (
					<button type="button" className={s.addPhoto} onClick={() => setTheme('new')}>
						＋ Themed day
					</button>
				)}
			</div>
			<ol className={s.weekDays}>
				{nextDays(today).map((day) => {
					const planned = plannedOn(plans, day);
					const themes = themesOn(plans, day).filter((t) => !planned.some((m) => m.meal === t.meal));
					return (
						<li key={day} className={s.weekDay} aria-label={dayWord(day, today)}>
							<span className={s.weekDayName}>{dayWord(day, today)}</span>
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
										<button type="button" className={s.weekThemeName} disabled={!parent} onClick={() => setTheme(t)}>
											<span aria-hidden="true">{t.emoji}</span> {t.name}
										</button>
										{pick ? (
											<>
												<span className={s.weekSuggest}>{pick.title}?</span>
												{parent && (
													<span className={s.weekThemeButtons}>
														<button
															type="button"
															className={s.noteAction}
															onClick={() => plan.mutate({ day, meal: t.meal, recipeId: pick.id })}
														>
															Use it
														</button>
														<button
															type="button"
															className={s.noteAction}
															onClick={() => setAnother({ ...another, [key]: (another[key] ?? 0) + 1 })}
														>
															Another
														</button>
													</span>
												)}
											</>
										) : (
											parent && (
												<button type="button" className={s.noteAction} onClick={() => onIdeas(t.from)}>
													✨ Ideas for {t.from}
												</button>
											)
										)}
									</div>
								);
							})}
							{parent && (
								<button
									type="button"
									className={s.weekAdd}
									aria-label={`Plan a meal, ${dayWord(day, today)}`}
									onClick={() =>
										setPlanning({
											day,
											// Dinner, unless it's planned already.
											meal: planned.some((m) => m.meal === 'dinner')
												? MEALS.find((x) => !planned.some((m) => m.meal === x.meal))?.meal
												: 'dinner',
										})
									}
								>
									＋
								</button>
							)}
						</li>
					);
				})}
			</ol>
			{planning && (
				<PlanIt
					day={planning.day}
					meal={planning.meal}
					plan={planning.plan}
					onClose={() => setPlanning(null)}
					onOpenRecipe={(id) => {
						setPlanning(null);
						onOpen(id);
					}}
				/>
			)}
			{theme && <ThemeForm theme={theme === 'new' ? undefined : theme} kinds={kinds} onClose={() => setTheme(null)} />}
		</section>
	);
}
