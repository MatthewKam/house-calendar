import { useState } from 'react';
import { useRecipeActions } from '../../lib/queries';
import { ingredientLine, minutesText } from '../../lib/recipes';
import type { Recipe } from '../../lib/types';
import { useWakeLock } from '../../lib/useWakeLock';
import Sheet from '../ui/Sheet';
import ConfirmDialog from '../ui/ConfirmDialog';
import RecipeForm from './RecipeForm';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

const SCALES: [string, number][] = [
	['×½', 0.5],
	['×1', 1],
	['×2', 2],
];

/** "Overnight" for 12 hours or more, else "4 hours before". */
const ahead = (h: number) => (h >= 12 ? 'the night before' : `${h} ${h === 1 ? 'hour' : 'hours'} before`);

/**
 * A recipe to cook from: big type, the amounts scaled ×½ or ×2, steps that grey out when tapped, what to
 * do ahead, notes and its pictures. The screen stays on while it's open. Grown-ups edit or delete it.
 */
export default function RecipeView({
	recipe: r,
	parent,
	onClose,
}: {
	recipe: Recipe;
	parent: boolean;
	onClose: () => void;
}) {
	const { update, remove } = useRecipeActions();
	const [scale, setScale] = useState(1);
	const [done, setDone] = useState<number[]>([]);
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [big, setBig] = useState<string | null>(null);
	// Cooking: no sleeping screen while it's open.
	useWakeLock(true);
	const cover = r.images.find((i) => i.id === r.coverId) ?? r.images[0];
	const groups = [...new Set(r.ingredients.map((i) => i.group))];

	if (editing) {
		return (
			<Sheet label={`Edit ${r.title}`} onClose={() => setEditing(false)}>
				<RecipeForm
					title="Edit recipe"
					initial={r}
					saving={update.isPending}
					onCancel={() => setEditing(false)}
					onSave={(recipe) => update.mutate({ id: r.id, recipe }, { onSuccess: () => setEditing(false) })}
				/>
			</Sheet>
		);
	}

	return (
		<>
			<Sheet label={r.title} onClose={onClose} className={s.view}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>{r.title}</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
						×
					</button>
				</header>
				{cover && <img className={s.cover} src={cover.url} alt="" onClick={() => setBig(cover.url)} />}

				<div className={s.meta}>
					{r.totalMinutes !== null && <span>⏱ {minutesText(r.totalMinutes)}</span>}
					{r.activeMinutes !== null && r.activeMinutes !== r.totalMinutes && (
						<span>{minutesText(r.activeMinutes)} hands-on</span>
					)}
					{r.servings !== null && <span>Serves {Math.round(r.servings * scale * 10) / 10}</span>}
				</div>
				<div className={s.tags}>
					{[r.meal, ...r.proteins, ...r.types].map((t) => (
						<span key={t} className={s.tag}>
							{t}
						</span>
					))}
				</div>

				{r.prepAhead.length > 0 && (
					<div className={s.ahead}>
						<b>Ahead of time</b>
						{r.prepAhead.map((p) => (
							<span key={p.what}>
								{p.what}, {ahead(p.hoursBefore)}
							</span>
						))}
					</div>
				)}

				<div className={s.sectionHead}>
					<h3>Ingredients</h3>
					<div className={s.scale} role="radiogroup" aria-label="Amounts">
						{SCALES.map(([label, x]) => (
							<button key={label} type="button" role="radio" aria-checked={scale === x} onClick={() => setScale(x)}>
								{label}
							</button>
						))}
					</div>
				</div>
				{groups.map((g) => (
					<div key={g ?? ''} className={s.group}>
						{g && <h4>{g}</h4>}
						<ul className={s.ingredients}>
							{r.ingredients
								.filter((i) => i.group === g)
								.map((i, n) => (
									<li key={n}>{ingredientLine(i, scale)}</li>
								))}
						</ul>
					</div>
				))}

				<h3 className={s.sectionHead}>Steps</h3>
				<ol className={s.steps}>
					{r.steps.map((step, n) => (
						<li key={n}>
							{/* Tapped: done, greyed out (tap again to bring it back). */}
							<button
								type="button"
								className={s.step}
								aria-pressed={done.includes(n)}
								onClick={() => setDone(done.includes(n) ? done.filter((d) => d !== n) : [...done, n])}
							>
								<span className={s.stepNumber}>{n + 1}</span>
								{step}
							</button>
						</li>
					))}
				</ol>

				{r.notes && (
					<>
						<h3 className={s.sectionHead}>Notes</h3>
						<p className={s.notes}>{r.notes}</p>
					</>
				)}

				{r.images.length > 0 && (
					<>
						<h3 className={s.sectionHead}>Pictures</h3>
						<div className={s.pictures}>
							{r.images.map((i) => (
								<button key={i.id} type="button" onClick={() => setBig(i.url)} aria-label="Open picture">
									<img src={i.thumbUrl} alt="" loading="lazy" />
								</button>
							))}
						</div>
					</>
				)}
				{r.sourceUrl && (
					<a className={s.sourceLink} href={r.sourceUrl} target="_blank" rel="noreferrer">
						From {new URL(r.sourceUrl).hostname.replace(/^www\./, '')}
					</a>
				)}

				<div className={sheet.actions}>
					{parent && (
						<button type="button" className={sheet.danger} onClick={() => setDeleting(true)}>
							Delete
						</button>
					)}
					<span className={sheet.spacer} />
					{parent && (
						<button type="button" className={sheet.secondary} onClick={() => setEditing(true)}>
							Edit
						</button>
					)}
					<button type="button" className={sheet.primary} onClick={onClose}>
						Done
					</button>
				</div>
			</Sheet>
			{big && (
				<div className={s.big} role="dialog" aria-label="Picture" onClick={() => setBig(null)}>
					<img src={big} alt="" />
				</div>
			)}
			{deleting && (
				<ConfirmDialog
					title={`Delete ${r.title}?`}
					confirmLabel="Delete"
					onCancel={() => setDeleting(false)}
					onConfirm={() => {
						remove.mutate(r.id);
						setDeleting(false);
						onClose();
					}}
				>
					Its pictures go too. This can't be undone.
				</ConfirmDialog>
			)}
		</>
	);
}
