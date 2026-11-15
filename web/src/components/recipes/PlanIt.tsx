import { useState } from 'react';
import { dayKey, fromDayKey } from '../../lib/dates';
import {
	boxValue,
	dayWord,
	earliestDay,
	mealAt,
	mealLabel,
	MEALS,
	nextDays,
	prepSteps,
	prepTitle,
	whenText,
	zone,
} from '../../lib/meals';
import { useMealActions, useRecipes } from '../../lib/queries';
import { coverOf, mealPicture } from '../../lib/recipes';
import type { MealPlan, PlanMeal, Recipe } from '../../lib/types';
import { useNow } from '../../lib/useNow';
import Sheet from '../ui/Sheet';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

/** A step's time changed, or its reminder off; kept per day and meal ("day|meal|step"). */
type Edits = Record<string, { at?: number; on?: boolean }>;

/**
 * Put a recipe on a day: the day (the next week as chips, or any date) and the meal (dinner to start). Under
 * them, the prep ahead as a timeline with real times (Fri 6 PM: thaw the ribeye; Fri 8 PM: marinate; Sat 6 PM:
 * dinner), each time changeable and each reminder able to be switched off; they go on To do. Too late for a
 * step (no time left to marinate overnight): it says so, and offers the earliest day that works. Opened from a
 * recipe, from a day in Plan ahead (the recipe picked here first, or a new one added), or from a planned one, to move it or take it off.
 */
export default function PlanIt({
	recipe: fixed,
	plan,
	day: firstDay,
	meal: firstMeal,
	onClose,
	onOpenRecipe,
	onNewRecipe,
}: {
	recipe?: Recipe;
	/** Planned already: moving it. */
	plan?: MealPlan;
	day?: string;
	meal?: PlanMeal;
	onClose: () => void;
	onOpenRecipe?: (id: string) => void;
	/** A new recipe for the day (from a screenshot, a photo or a link, as with ＋ Recipe). */
	onNewRecipe?: () => void;
}) {
	const now = useNow();
	const today = dayKey(now);
	const recipes = useRecipes().data ?? [];
	const { plan: add, move, unplan } = useMealActions();
	const [recipeId, setRecipeId] = useState(fixed?.id ?? plan?.recipeId ?? null);
	const [day, setDay] = useState(plan?.day ?? firstDay ?? today);
	const [meal, setMeal] = useState<PlanMeal>(plan?.meal ?? firstMeal ?? 'dinner');
	const [edits, setEdits] = useState<Edits>({});
	const [find, setFind] = useState('');
	const recipe = recipes.find((r) => r.id === recipeId) ?? fixed;
	const days = nextDays(today);

	// No recipe yet (a day in Plan ahead): pick one of the recipes.
	if (!recipe) {
		const shown = recipes.filter((r) => r.title.toLowerCase().includes(find.trim().toLowerCase()));
		return (
			<Sheet label="Pick a recipe" onClose={onClose} className={s.planView}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>
						{mealLabel(meal)}, {dayWord(day, today)}
					</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
						×
					</button>
				</header>
				{onNewRecipe && (
					<button type="button" className={s.planNew} onClick={onNewRecipe}>
						<span className={s.planNewPlus} aria-hidden="true">
							＋
						</span>
						<span>
							<b>A new recipe</b>
							<span className={s.hint}>From a screenshot, a photo of a page, or a link</span>
						</span>
					</button>
				)}
				{recipes.length > 0 && <h3 className={s.planLabel}>Or one of your recipes</h3>}
				{recipes.length > 0 && (
					<input
						className={s.ideasInput}
						placeholder="Find a recipe"
						aria-label="Find a recipe"
						value={find}
						onChange={(e) => setFind(e.target.value)}
					/>
				)}
				{recipes.length === 0 && !onNewRecipe && (
					<p className={s.hint}>No recipes yet. Add one with ＋ Recipe first.</p>
				)}
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

	// The prep's times for this day and meal, as worked out, changed here, or off. Already past: off.
	const steps = prepSteps(recipe, day, meal).map((p, i) => {
		const key = `${day}|${meal}|${i}`;
		const late = p.at <= now.getTime();
		const at = edits[key]?.at ?? p.at;
		return { ...p, key, late, at, on: edits[key]?.on ?? !late };
	});
	const late = steps.filter((p) => p.late);
	const earliest = late.length ? earliestDay(recipe, meal, now.getTime(), today) : null;
	const timeline = [...steps].sort((a, b) => a.at - b.at);
	const edit = (key: string, change: { at?: number; on?: boolean }) =>
		setEdits({ ...edits, [key]: { ...edits[key], ...change } });

	const save = () => {
		const reminders = steps
			.filter((p) => p.on)
			.map((p) => ({
				title: prepTitle(p.what, recipe.title, p.at, day, meal, zone()),
				due: new Date(p.at).toISOString(),
			}));
		if (plan) move.mutate({ id: plan.id, day, meal, reminders });
		else add.mutate({ day, meal, recipeId: recipe.id, reminders });
		onClose();
	};

	return (
		<Sheet
			label={plan ? 'Move' : 'Put it on a day'}
			onClose={onClose}
			className={s.planView}
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<header className={sheet.head}>
				<h2 className={sheet.heading}>{recipe.title}</h2>
				<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
					×
				</button>
			</header>
			<div className={s.part}>
				<span className={s.planHead}>
					<h3 className={s.planLabel}>Day</h3>
					<span className={s.select}>
						<select aria-label="Meal" value={meal} onChange={(e) => setMeal(e.target.value as PlanMeal)}>
							{MEALS.map((m) => (
								<option key={m.meal} value={m.meal}>
									{m.emoji} {m.label}
								</option>
							))}
						</select>
					</span>
				</span>
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

			{late.length > 0 && (
				<div className={s.planLate} role="status">
					<span>
						⚠ Too late to {late.map((p) => p.what.replace(/[.\s]+$/, '').toLowerCase()).join(' and ')} in time for{' '}
						{dayWord(day, today).toLowerCase()}’s {meal}.
					</span>
					{earliest && earliest !== day && (
						<button type="button" className={s.noteAction} onClick={() => setDay(earliest)}>
							Make it {dayWord(earliest, today)} instead
						</button>
					)}
				</div>
			)}

			{steps.length > 0 && (
				<div className={s.part}>
					<h3 className={s.planLabel}>Reminders on To do</h3>
					<ol className={s.timeline}>
						{timeline.map((p) => (
							<li key={p.key} className={s.timelineRow} data-off={!p.on || undefined}>
								{/* The time: tap to change it. */}
								<label className={s.timelineWhen}>
									{whenText(p.at, today)}
									<input
										type="datetime-local"
										aria-label={`When to ${p.what.toLowerCase()}`}
										value={boxValue(p.at)}
										onChange={(e) =>
											e.target.value && edit(p.key, { at: new Date(e.target.value).getTime(), on: true })
										}
									/>
								</label>
								<span className={s.timelineWhat}>{p.what}</span>
								<input
									type="checkbox"
									role="switch"
									className={s.timelineSwitch}
									aria-label={`Remind me to ${p.what.toLowerCase()}`}
									checked={p.on}
									onChange={(e) => edit(p.key, { on: e.target.checked })}
								/>
							</li>
						))}
						<li className={`${s.timelineRow} ${s.timelineMeal}`}>
							<span className={s.timelineWhen}>{whenText(mealAt(day, meal, zone()), today)}</span>
							<span className={s.timelineWhat}>
								{MEALS.find((m) => m.meal === meal)!.emoji} {mealLabel(meal)}
							</span>
						</li>
					</ol>
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
