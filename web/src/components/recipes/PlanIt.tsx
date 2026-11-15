import { useState } from 'react';
import { dayKey, fromDayKey } from '../../lib/dates';
import { dayWord, MEALS, nextDays } from '../../lib/meals';
import { useMealActions, useRecipes } from '../../lib/queries';
import { aheadText, coverOf, mealPicture } from '../../lib/recipes';
import type { MealPlan, PlanMeal, Recipe } from '../../lib/types';
import { useNow } from '../../lib/useNow';
import Sheet from '../ui/Sheet';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

/**
 * A recipe on a day (Plan it): the day (the next week as chips, or any date) and the meal. Its prep ahead
 * (marinate overnight) goes on To do as reminders at a sensible time. Opened from a recipe, from an empty
 * day in This week (the recipe picked here first), or from a planned one, to move it or take it off.
 */
export default function PlanIt({
	recipe: fixed,
	plan,
	day: firstDay,
	meal: firstMeal,
	onClose,
	onOpenRecipe,
}: {
	recipe?: Recipe;
	/** Planned already: moving it. */
	plan?: MealPlan;
	day?: string;
	meal?: PlanMeal;
	onClose: () => void;
	onOpenRecipe?: (id: string) => void;
}) {
	const today = dayKey(useNow());
	const recipes = useRecipes().data ?? [];
	const { plan: add, move, unplan } = useMealActions();
	const [recipeId, setRecipeId] = useState(fixed?.id ?? plan?.recipeId ?? null);
	const [day, setDay] = useState(plan?.day ?? firstDay ?? today);
	const [meal, setMeal] = useState<PlanMeal>(plan?.meal ?? firstMeal ?? 'dinner');
	const [find, setFind] = useState('');
	const recipe = recipes.find((r) => r.id === recipeId) ?? fixed;
	const days = nextDays(today);
	const label = plan ? 'Move' : 'Plan it';

	const save = () => {
		if (!recipe) return;
		if (plan) move.mutate({ id: plan.id, day, meal });
		else add.mutate({ day, meal, recipeId: recipe.id });
		onClose();
	};

	// No recipe yet (an empty day): pick one from the book.
	if (!recipe) {
		const shown = recipes.filter((r) => r.title.toLowerCase().includes(find.trim().toLowerCase()));
		return (
			<Sheet label="Pick a recipe" onClose={onClose} className={s.planView}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>
						{MEALS.find((m) => m.meal === meal)!.label}, {dayWord(day, today)}
					</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
						×
					</button>
				</header>
				<input
					className={s.ideasInput}
					placeholder="Find a recipe"
					aria-label="Find a recipe"
					value={find}
					onChange={(e) => setFind(e.target.value)}
				/>
				{recipes.length === 0 && <p className={s.hint}>The book is empty. Add a recipe with ＋ Recipe first.</p>}
				<ul className={s.planChoices}>
					{shown.map((r) => {
						const cover = coverOf(r);
						return (
							<li key={r.id}>
								<button type="button" className={s.planChoice} onClick={() => setRecipeId(r.id)}>
									{cover ? (
										<img src={cover.thumbUrl} alt="" />
									) : (
										<span className={s.defaultPicture} aria-hidden="true">
											{mealPicture(r.meal)}
										</span>
									)}
									<span>{r.title}</span>
								</button>
							</li>
						);
					})}
				</ul>
			</Sheet>
		);
	}

	const prep = recipe.prepAhead.filter((p) => p.hoursBefore > 0);
	return (
		<Sheet
			label={label}
			onClose={onClose}
			className={s.planView}
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<header className={sheet.head}>
				<h2 className={sheet.heading}>
					{label}: {recipe.title}
				</h2>
				<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
					×
				</button>
			</header>
			<div className={s.part}>
				<h3 className={s.planLabel}>Day</h3>
				<div className={s.tagChoices}>
					{days.map((d) => (
						<button key={d} type="button" className={s.chip} aria-pressed={day === d} onClick={() => setDay(d)}>
							{dayWord(d, today)}
						</button>
					))}
					{/* Another day: a chip that opens the date picker, saying the day once picked. */}
					<label className={`${s.chip} ${s.planDate}`} data-on={!days.includes(day) || undefined}>
						📅{' '}
						{days.includes(day)
							? 'Other day'
							: fromDayKey(day).toLocaleDateString([], { month: 'short', day: 'numeric' })}
						<input
							type="date"
							aria-label="Another day"
							value={day}
							min={today}
							onChange={(e) => e.target.value && setDay(e.target.value)}
						/>
					</label>
				</div>
			</div>
			<div className={s.part}>
				<h3 className={s.planLabel}>Meal</h3>
				<div className={s.tagChoices}>
					{MEALS.map((m) => (
						<button
							key={m.meal}
							type="button"
							className={s.chip}
							aria-pressed={meal === m.meal}
							onClick={() => setMeal(m.meal)}
						>
							<span aria-hidden="true">{m.emoji}</span> {m.label}
						</button>
					))}
				</div>
			</div>
			{prep.length > 0 && (
				<div className={s.part}>
					<h3 className={s.planLabel}>Reminders on To do</h3>
					<ul className={s.planPrep}>
						{prep.map((p) => (
							<li key={p.what}>
								⏰ {p.what} <span className={s.hint}>({aheadText(p.hoursBefore)}, at a sensible time)</span>
							</li>
						))}
					</ul>
				</div>
			)}
			<div className={`${sheet.actions} ${s.planActions}`}>
				{plan && (
					<button
						type="button"
						className={sheet.danger}
						onClick={() => {
							unplan.mutate(plan.id);
							onClose();
						}}
					>
						Take off
					</button>
				)}
				{plan && onOpenRecipe && (
					<button type="button" className={sheet.secondary} onClick={() => onOpenRecipe(plan.recipeId)}>
						Open recipe
					</button>
				)}
				<span className={sheet.spacer} />
				<button type="button" className={sheet.secondary} onClick={onClose}>
					Cancel
				</button>
				<button type="submit" className={sheet.primary}>
					{plan ? 'Move' : 'Plan it'}
				</button>
			</div>
		</Sheet>
	);
}
