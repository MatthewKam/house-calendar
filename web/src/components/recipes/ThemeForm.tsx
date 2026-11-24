import { useState } from 'react';
import { MEALS, THEME_EMOJI } from '../../lib/meals';
import { useMealActions } from '../../lib/queries';
import type { MealTheme, PlanMeal } from '../../lib/types';
import ConfirmDialog from '../ui/ConfirmDialog';
import Sheet from '../ui/Sheet';
import sheet from '../ui/styles/Sheet.module.css';
import s from './Recipes.module.css';
import { Button, IconButton } from '../ui/Button';
import { Input, Select } from '../ui/Field';

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
	new Date(2024, 0, 7 + i).toLocaleDateString([], { weekday: 'long' }),
);

/**
 * A themed day, new or changed: its name and picture (🥞 Pancake Friday), the day and meal each week, and
 * what to suggest from the book (a kind, a protein or a tag).
 */
export default function ThemeForm({
	theme,
	kinds,
	onClose,
}: {
	theme?: MealTheme;
	/** The kinds and tags the book has, to pick from. */
	kinds: string[];
	onClose: () => void;
}) {
	const { addTheme, editTheme, removeTheme } = useMealActions();
	const [name, setName] = useState(theme?.name ?? '');
	const [emoji, setEmoji] = useState(theme?.emoji ?? THEME_EMOJI[0]);
	const [weekday, setWeekday] = useState(theme?.weekday ?? 5);
	const [meal, setMeal] = useState<PlanMeal>(theme?.meal ?? 'dinner');
	const [from, setFrom] = useState(theme?.from ?? '');
	const [removing, setRemoving] = useState(false);
	const ready = name.trim() && from.trim();

	const save = () => {
		if (!ready) return;
		const t = { name: name.trim(), emoji, weekday, meal, from: from.trim() };
		if (theme) editTheme.mutate({ id: theme.id, theme: t });
		else addTheme.mutate(t);
		onClose();
	};

	return (
		<Sheet
			label="Themed day"
			onClose={onClose}
			className={s.planView}
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<header className={sheet.head}>
				<h2 className={sheet.heading}>Themed day</h2>
				<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
			</header>
			<Input
				className={s.ideasInput}
				placeholder="Name (Pancake Friday)"
				aria-label="Name"
				maxLength={40}
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
			<div className={s.tagChoices} role="group" aria-label="Picture">
				{THEME_EMOJI.map((e) => (
					<button
						key={e}
						type="button"
						className={`${s.chip} ${s.emojiChip}`}
						aria-pressed={emoji === e}
						aria-label={e}
						onClick={() => setEmoji(e)}
					>
						{e}
					</button>
				))}
			</div>
			<div className={s.themeWhen}>
				<Select aria-label="Day" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
					{WEEKDAYS.map((d, i) => (
						<option key={d} value={i}>
							Every {d}
						</option>
					))}
				</Select>
				<Select aria-label="Meal" value={meal} onChange={(e) => setMeal(e.target.value as PlanMeal)}>
					{MEALS.map((m) => (
						<option key={m.meal} value={m.meal}>
							{m.label}
						</option>
					))}
				</Select>
			</div>
			<Input
				className={s.ideasInput}
				placeholder="Suggest from (pancakes, pasta, Kid approved)"
				aria-label="Suggest from"
				list="theme-kinds"
				maxLength={40}
				value={from}
				onChange={(e) => setFrom(e.target.value)}
			/>
			<datalist id="theme-kinds">
				{kinds.map((k) => (
					<option key={k} value={k} />
				))}
			</datalist>
			<p className={s.hint}>Each week it suggests one of your recipes that fits, a different one from last week.</p>
			<div className={`${sheet.actions} ${s.planActions}`}>
				{theme && (
					<Button variant="danger" onClick={() => setRemoving(true)}>
						Delete
					</Button>
				)}
				<span className={sheet.spacer} />
				<Button onClick={onClose}>Cancel</Button>
				<Button variant="primary" type="submit" disabled={!ready}>
					Save
				</Button>
			</div>
			{removing && theme && (
				<ConfirmDialog
					title={`Delete ${theme.name}?`}
					confirmLabel="Delete"
					onCancel={() => setRemoving(false)}
					onConfirm={() => {
						removeTheme.mutate(theme.id);
						onClose();
					}}
				>
					What's already planned stays.
				</ConfirmDialog>
			)}
		</Sheet>
	);
}
