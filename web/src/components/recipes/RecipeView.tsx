import { useState } from 'react';
import { useAddToGroceries, useRecipeActions } from '../../lib/queries';
import { ingredientLine, minutesText } from '../../lib/recipes';
import type { Recipe } from '../../lib/types';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from '../../lib/useMediaQuery';
import { useWakeLock } from '../../lib/useWakeLock';
import Sheet from '../ui/Sheet';
import ConfirmDialog from '../ui/ConfirmDialog';
import CookingBar from './CookingBar';
import RecipeForm from './RecipeForm';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

const SCALES: [string, number][] = [
	['×½', 0.5],
	['×1', 1],
	['×2', 2],
];

/** "the night before" for 12 hours or more, else "4 hours before". */
const ahead = (h: number) => (h >= 12 ? 'the night before' : `${h} ${h === 1 ? 'hour' : 'hours'} before`);

/** The recipe as text to send (the phone's own share sheet): name, time, ingredients, steps, notes. */
function asText(r: Recipe) {
	const lines = [r.title];
	if (r.totalMinutes !== null)
		lines.push(`${minutesText(r.totalMinutes)}${r.servings ? ` · serves ${r.servings}` : ''}`);
	lines.push('', 'Ingredients');
	let group: string | null = null;
	for (const i of r.ingredients) {
		if (i.group && i.group !== group) lines.push(`${i.group}:`);
		group = i.group;
		lines.push(`- ${ingredientLine(i)}`);
	}
	lines.push('', 'Steps', ...r.steps.map((step, n) => `${n + 1}. ${step}`));
	if (r.notes) lines.push('', r.notes);
	if (r.sourceUrl) lines.push('', r.sourceUrl);
	return lines.join('\n');
}

/**
 * A recipe, in two states. Planning (as it opens): the ingredients are a checklist of what you have, and
 * the rest go on the Groceries list in a tap. Cooking (Start cooking): a timer counts up, timers can be
 * set, the checklist clears to tick off what's prepped or gathered, and steps grey out as they're done.
 * Big screens: ingredients and steps side by side; phones: one or the other. Sections with nothing in
 * them aren't shown. The screen stays on while it's open.
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
	const groceries = useAddToGroceries();
	const [scale, setScale] = useState(1);
	// Ingredients ticked: what's in the house (planning), or what's prepped (cooking), by index.
	const [have, setHave] = useState<number[]>([]);
	const [prepped, setPrepped] = useState<number[]>([]);
	const [stepsDone, setStepsDone] = useState<number[]>([]);
	const [cookingSince, setCookingSince] = useState<number | null>(null);
	const [tab, setTab] = useState<'ingredients' | 'steps'>('ingredients');
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [big, setBig] = useState<string | null>(null);
	const [said, setSaid] = useState<string | null>(null);
	// Both asked every time (hooks can't be skipped).
	const upright = useMediaQuery(PHONE);
	const sideways = useMediaQuery(PHONE_SIDEWAYS);
	const phone = upright || sideways;
	// Cooking from it: no sleeping screen while it's open.
	useWakeLock(true);

	const cooking = cookingSince !== null;
	const ticked = cooking ? prepped : have;
	const setTicked = cooking ? setPrepped : setHave;
	const cover = r.images.find((i) => i.id === r.coverId) ?? r.images[0];
	// The pictures beyond the cover (the recipe's own screenshots).
	const others = r.images.filter((i) => i.id !== cover?.id);
	const groups = [...new Set(r.ingredients.map((i) => i.group))];
	const tags = [r.meal, ...r.proteins, ...r.types];
	const missing = r.ingredients.map((i, n) => ({ i, n })).filter(({ n }) => !have.includes(n));
	const toggle = (list: number[], n: number) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n]);

	async function share() {
		const text = asText(r);
		try {
			if (navigator.share) await navigator.share({ title: r.title, text });
			else {
				await navigator.clipboard.writeText(text);
				setSaid('Copied the recipe, ready to paste.');
			}
		} catch {
			// Closed the share sheet: nothing to say.
		}
	}

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

	const ingredients = r.ingredients.length > 0 && (
		<section className={s.part} aria-label="Ingredients">
			<div className={s.sectionHead}>
				<h3>{cooking ? 'Prep and gather' : 'Ingredients'}</h3>
				<div className={s.scale} role="radiogroup" aria-label="Amounts">
					{SCALES.map(([label, x]) => (
						<button key={label} type="button" role="radio" aria-checked={scale === x} onClick={() => setScale(x)}>
							{label}
						</button>
					))}
				</div>
			</div>
			<p className={s.hint}>{cooking ? 'Tick each one once it’s prepped or out.' : 'Tick what you have.'}</p>
			{groups.map((g) => (
				<div key={g ?? ''} className={s.group}>
					{g && <h4>{g}</h4>}
					<ul className={s.checklist}>
						{r.ingredients.map((i, n) =>
							i.group !== g ? null : (
								<li key={n}>
									<label className={s.check}>
										<input type="checkbox" checked={ticked.includes(n)} onChange={() => setTicked(toggle(ticked, n))} />
										<span>{ingredientLine(i, scale)}</span>
									</label>
								</li>
							),
						)}
					</ul>
				</div>
			))}
			{!cooking && missing.length > 0 && (
				<button
					type="button"
					className={s.cookButton}
					disabled={groceries.isPending}
					onClick={() =>
						groceries.mutate(
							missing.map(({ i }) => `${ingredientLine(i, scale)} · for ${r.title}`),
							{
								onSuccess: (n) => setSaid(n ? `Added ${n} to Groceries.` : 'They’re already on Groceries.'),
							},
						)
					}
				>
					🛒 Add {missing.length} missing to Groceries
				</button>
			)}
		</section>
	);

	const steps = r.steps.length > 0 && (
		<section className={s.part} aria-label="Steps">
			<h3 className={s.sectionHead}>Steps</h3>
			<ol className={s.steps}>
				{r.steps.map((step, n) => (
					<li key={n}>
						{/* Tapped: done, greyed out (tap again to bring it back). */}
						<button
							type="button"
							className={s.step}
							aria-pressed={stepsDone.includes(n)}
							onClick={() => setStepsDone(toggle(stepsDone, n))}
						>
							<span className={s.stepNumber}>{n + 1}</span>
							{step}
						</button>
					</li>
				))}
			</ol>
		</section>
	);

	return (
		<>
			<Sheet label={r.title} onClose={onClose} className={s.view}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>{r.title}</h2>
					<span className={sheet.spacer} />
					<button type="button" className={s.iconButton} onClick={() => void share()} aria-label="Share the recipe">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							{/* A box with an arrow up out of it. */}
							<path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
						</svg>
					</button>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
						×
					</button>
				</header>

				{/* The top: its photo, and what to know before starting. */}
				<div className={`${s.top} ${cover ? '' : s.topNoPhoto}`}>
					{cover && <img className={s.cover} src={cover.url} alt="" onClick={() => setBig(cover.url)} />}
					<div className={s.about}>
						{(r.totalMinutes !== null || r.activeMinutes !== null || r.servings !== null) && (
							<div className={s.meta}>
								{r.totalMinutes !== null && <span>⏱ {minutesText(r.totalMinutes)}</span>}
								{r.activeMinutes !== null && r.activeMinutes !== r.totalMinutes && (
									<span>{minutesText(r.activeMinutes)} hands-on</span>
								)}
								{r.servings !== null && <span>Serves {Math.round(r.servings * scale * 10) / 10}</span>}
							</div>
						)}
						{tags.length > 0 && (
							<div className={s.tags}>
								{tags.map((t) => (
									<span key={t} className={s.tag}>
										{t}
									</span>
								))}
							</div>
						)}
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
						{cooking ? (
							<CookingBar startedAt={cookingSince} onDone={() => setCookingSince(null)} />
						) : (
							<button
								type="button"
								className={s.startCooking}
								onClick={() => {
									// A fresh start: the checklist clears, for what's prepped or gathered.
									setPrepped([]);
									setStepsDone([]);
									setCookingSince(Date.now());
								}}
							>
								Start cooking
							</button>
						)}
						{said && (
							<p className={s.said} role="status">
								{said}
							</p>
						)}
					</div>
				</div>

				{/* Phones: one at a time; bigger screens: side by side. */}
				{phone && ingredients && steps && (
					<div className={s.tabs} role="tablist" aria-label="Recipe">
						<button
							type="button"
							role="tab"
							aria-selected={tab === 'ingredients'}
							onClick={() => setTab('ingredients')}
						>
							Ingredients
						</button>
						<button type="button" role="tab" aria-selected={tab === 'steps'} onClick={() => setTab('steps')}>
							Steps
						</button>
					</div>
				)}
				<div className={phone ? undefined : s.columns}>
					{(!phone || tab === 'ingredients' || !steps) && ingredients}
					{(!phone || tab === 'steps' || !ingredients) && steps}
				</div>

				{r.notes && (
					<section className={s.part} aria-label="Notes">
						<h3 className={s.sectionHead}>Notes</h3>
						<p className={s.notes}>{r.notes}</p>
					</section>
				)}
				{others.length > 0 && (
					<section className={s.part} aria-label="Pictures">
						<h3 className={s.sectionHead}>Pictures</h3>
						<div className={s.pictures}>
							{others.map((i) => (
								<button key={i.id} type="button" onClick={() => setBig(i.url)} aria-label="Open picture">
									<img src={i.thumbUrl} alt="" loading="lazy" />
								</button>
							))}
						</div>
					</section>
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
