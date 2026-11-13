import { useState, type ReactNode } from 'react';
import { ingredientsText, parseIngredients } from '../../lib/recipes';
import type { Meal, RecipeFields } from '../../lib/types';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

const MEALS: Meal[] = ['dinner', 'breakfast', 'lunch', 'side', 'dessert', 'snack'];

/** "a, b, c" ⇄ a list, for the browsing words. */
const words = (text: string) =>
	text
		.split(',')
		.map((w) => w.trim().toLowerCase())
		.filter(Boolean);
/** A number field's value, or null when empty. */
const numberOrNull = (text: string) => (text.trim() === '' ? null : Math.max(0, Math.round(Number(text)) || 0));

/**
 * A recipe to check (a fresh draft Claude read) or edit: everything in plain fields. Ingredients and
 * steps are one a line (a line ending in ":" is a heading: "For the marinade:"); amounts are worked out
 * from what's typed, so ×½ and ×2 still work. `above` shows over the fields (the draft's pictures).
 */
export default function RecipeForm({
	title,
	initial,
	saving,
	onSave,
	onCancel,
	above,
}: {
	title: string;
	initial: RecipeFields;
	saving: boolean;
	onSave: (recipe: RecipeFields) => void;
	onCancel: () => void;
	above?: ReactNode;
}) {
	const [name, setName] = useState(initial.title);
	const [meal, setMeal] = useState<Meal>(initial.meal);
	const [servings, setServings] = useState(initial.servings?.toString() ?? '');
	const [total, setTotal] = useState(initial.totalMinutes?.toString() ?? '');
	const [active, setActive] = useState(initial.activeMinutes?.toString() ?? '');
	const [ingredients, setIngredients] = useState(ingredientsText(initial.ingredients));
	const [steps, setSteps] = useState(initial.steps.join('\n'));
	const [notes, setNotes] = useState(initial.notes ?? '');
	const [ahead, setAhead] = useState(initial.prepAhead);
	const [proteins, setProteins] = useState(initial.proteins.join(', '));
	const [vegetables, setVegetables] = useState(initial.vegetables.join(', '));
	const [types, setTypes] = useState(initial.types.join(', '));

	function save() {
		const n = numberOrNull(servings);
		onSave({
			title: name.trim(),
			meal,
			servings: n ? Math.min(100, n) : null,
			totalMinutes: numberOrNull(total),
			activeMinutes: numberOrNull(active),
			ingredients: parseIngredients(ingredients),
			steps: steps
				.split('\n')
				.map((l) => l.trim())
				.filter(Boolean),
			notes: notes.trim() || null,
			prepAhead: ahead.filter((a) => a.what.trim()).map((a) => ({ ...a, what: a.what.trim() })),
			proteins: words(proteins),
			vegetables: words(vegetables),
			types: words(types),
			sourceUrl: initial.sourceUrl,
		});
	}

	return (
		<form
			className={s.form}
			onSubmit={(e) => {
				e.preventDefault();
				if (name.trim()) save();
			}}
		>
			<header className={sheet.head}>
				<h2 className={sheet.heading}>{title}</h2>
				<button type="button" className={sheet.close} onClick={onCancel} aria-label="Close">
					×
				</button>
			</header>
			{above}
			<label className={s.field}>
				<span>Name</span>
				<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
			</label>
			<div className={s.fieldRow}>
				<label className={s.field}>
					<span>Meal</span>
					<select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
						{MEALS.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				</label>
				<label className={s.field}>
					<span>Serves</span>
					<input inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
				</label>
				<label className={s.field}>
					<span>Total min</span>
					<input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
				</label>
				<label className={s.field}>
					<span>Hands-on min</span>
					<input inputMode="numeric" value={active} onChange={(e) => setActive(e.target.value)} />
				</label>
			</div>
			<label className={s.field}>
				<span>Ingredients, one a line (a heading ends in ":")</span>
				<textarea rows={8} value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
			</label>
			<label className={s.field}>
				<span>Steps, one a line</span>
				<textarea rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} />
			</label>
			<div className={s.field}>
				<span>Ahead of time</span>
				{ahead.map((a, i) => (
					<div key={i} className={s.aheadRow}>
						<input
							aria-label="What to do ahead"
							value={a.what}
							onChange={(e) => setAhead(ahead.map((x, j) => (j === i ? { ...x, what: e.target.value } : x)))}
						/>
						<input
							aria-label="Hours before"
							inputMode="numeric"
							className={s.hours}
							value={a.hoursBefore}
							onChange={(e) =>
								setAhead(
									ahead.map((x, j) => (j === i ? { ...x, hoursBefore: Math.max(0, Number(e.target.value) || 0) } : x)),
								)
							}
						/>
						<span className={s.hoursLabel}>hrs before</span>
						<button type="button" className={s.textLink} onClick={() => setAhead(ahead.filter((_, j) => j !== i))}>
							Remove
						</button>
					</div>
				))}
				<button
					type="button"
					className={s.textLink}
					onClick={() => setAhead([...ahead, { what: '', hoursBefore: 12 }])}
				>
					＋ Something to do ahead
				</button>
			</div>
			<label className={s.field}>
				<span>Notes</span>
				<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
			</label>
			<label className={s.field}>
				<span>Protein (commas between)</span>
				<input value={proteins} onChange={(e) => setProteins(e.target.value)} placeholder="chicken, beans" />
			</label>
			<label className={s.field}>
				<span>Vegetables</span>
				<input value={vegetables} onChange={(e) => setVegetables(e.target.value)} placeholder="broccoli, carrots" />
			</label>
			<label className={s.field}>
				<span>Type</span>
				<input value={types} onChange={(e) => setTypes(e.target.value)} placeholder="soup, korean" />
			</label>
			<div className={sheet.actions}>
				<span className={sheet.spacer} />
				<button type="button" className={sheet.secondary} onClick={onCancel}>
					Cancel
				</button>
				<button type="submit" className={sheet.primary} disabled={!name.trim() || saving}>
					{saving ? 'Saving…' : 'Save recipe'}
				</button>
			</div>
		</form>
	);
}
