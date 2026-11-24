import { useState, type ReactNode } from 'react';
import { ingredientsText, parseIngredients } from '../../lib/recipes';
import type { Meal, RecipeFields } from '../../lib/types';
import sheet from '../ui/styles/Sheet.module.css';
import s from './Recipes.module.css';
import { Button, IconButton } from '../ui/Button';
import { Field, Fieldset, Input, Select, TextArea } from '../ui/Field';

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
				<IconButton label="Close" icon="×" className={sheet.close} onClick={onCancel} />
			</header>
			{above}
			<Field label="Name">
				<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
			</Field>
			<div className={s.fieldRow}>
				<Field label="Meal">
					<Select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
						{MEALS.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Serves">
					<Input inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
				</Field>
				<Field label="Total min">
					<Input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
				</Field>
				<Field label="Hands-on min">
					<Input inputMode="numeric" value={active} onChange={(e) => setActive(e.target.value)} />
				</Field>
			</div>
			<Field label={`Ingredients, one a line (a heading ends in ":")`}>
				<TextArea rows={8} value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
			</Field>
			<Field label="Steps, one a line">
				<TextArea rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} />
			</Field>
			<Fieldset label="Ahead of time" className={s.ahead}>
				{ahead.map((a, i) => (
					<div key={i} className={s.aheadRow}>
						<Input
							aria-label="What to do ahead"
							value={a.what}
							onChange={(e) => setAhead(ahead.map((x, j) => (j === i ? { ...x, what: e.target.value } : x)))}
						/>
						<Input
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
						<Button
							variant="link"
							size="sm"
							className={s.textLink}
							onClick={() => setAhead(ahead.filter((_, j) => j !== i))}
						>
							Remove
						</Button>
					</div>
				))}
				<Button
					variant="link"
					size="sm"
					className={s.textLink}

					onClick={() => setAhead([...ahead, { what: '', hoursBefore: 12 }])}
				>
					＋ Something to do ahead
				</Button>
			</Fieldset>
			<Field label="Notes">
				<TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
			</Field>
			<Field label="Protein (commas between)">
				<Input value={proteins} onChange={(e) => setProteins(e.target.value)} placeholder="chicken, beans" />
			</Field>
			<Field label="Vegetables">
				<Input value={vegetables} onChange={(e) => setVegetables(e.target.value)} placeholder="broccoli, carrots" />
			</Field>
			<Field label="Type">
				<Input value={types} onChange={(e) => setTypes(e.target.value)} placeholder="soup, korean" />
			</Field>
			<div className={sheet.actions}>
				<span className={sheet.spacer} />
				<Button onClick={onCancel}>Cancel</Button>
				<Button variant="primary" type="submit" disabled={!name.trim() || saving}>
					{saving ? 'Saving…' : 'Save recipe'}
				</Button>
			</div>
		</form>
	);
}
