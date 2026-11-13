import { useRef, useState } from 'react';
import { useAddToGroceries, useAuthStatus, useMembers, useRecipeActions } from '../../lib/queries';
import { coverOf, ingredientLine, mealPicture, minutesText, toJpeg } from '../../lib/recipes';
import type { Member, Recipe } from '../../lib/types';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from '../../lib/useMediaQuery';
import { useWakeLock } from '../../lib/useWakeLock';
import Sheet from '../ui/Sheet';
import ConfirmDialog from '../ui/ConfirmDialog';
import CookingBar from './CookingBar';
import RecipeForm from './RecipeForm';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

/** How many times the recipe: for a smaller meal, or a crowd. */
const SCALES = [0.5, 1, 2, 4, 6, 8];

/** "the night before" for 12 hours or more, else "4 hours before". */
const ahead = (h: number) => (h >= 12 ? 'the night before' : `${h} ${h === 1 ? 'hour' : 'hours'} before`);

/** The recipe as text to send (the phone's own share sheet): name, time, ingredients, steps, notes. */
function asText(r: Recipe) {
	const lines = [r.title];
	if (r.totalMinutes) lines.push(`${minutesText(r.totalMinutes)}${r.servings ? ` · serves ${r.servings}` : ''}`);
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
	const { update, remove, addImages, setCover, removeImage, logCook, rate } = useRecipeActions();
	// Done cooking: how long it took, while it's asked whether to keep that.
	const [finished, setFinished] = useState<number | null>(null);
	const endCooking = (save: boolean) => {
		if (save && finished) logCook.mutate({ id: r.id, minutes: finished });
		setFinished(null);
		setCookingSince(null);
	};
	// Ratings: everyone in the family. Each changes their own; a parent a kid's; the account holder anyone's.
	const people = useMembers().data ?? [];
	const auth = useAuthStatus().data;
	const canRate = (m: Member) =>
		!auth?.signedIn || auth.holder || auth.memberId === m.id || (auth.parent && !m.guardian);
	// Adding photos: which step they're of (null: of the dish), then the picker.
	const picker = useRef<HTMLInputElement>(null);
	const photosFor = useRef<number | null>(null);
	const choosePhotos = (step: number | null) => {
		photosFor.current = step;
		picker.current?.click();
	};
	async function addPhotos(files: File[]) {
		try {
			const images = await Promise.all(files.map((f) => toJpeg(f)));
			addImages.mutate({ id: r.id, images, step: photosFor.current });
		} catch {
			setSaid("Couldn't read that photo (try a JPEG or PNG).");
		}
	}
	const [removing, setRemoving] = useState<string | null>(null);
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
	// Sent to Groceries: how many went on (shown with a link to the list) until the ticks change.
	const [sent, setSent] = useState<number | null>(null);
	// Both asked every time (hooks can't be skipped).
	const upright = useMediaQuery(PHONE);
	const sideways = useMediaQuery(PHONE_SIDEWAYS);
	const phone = upright || sideways;
	// Cooking from it: no sleeping screen while it's open.
	useWakeLock(true);

	const cooking = cookingSince !== null;
	const ticked = cooking ? prepped : have;
	const setTicked = cooking ? setPrepped : setHave;
	const cover = coverOf(r);
	// The dish's own photos (not a step's), the main one among them.
	const own = r.images.filter((i) => i.step === null);
	const stepPhotos = (n: number) => r.images.filter((i) => i.step === n);
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
				<span className={s.select}>
					<select
						aria-label="How many times the recipe"
						value={scale}
						onChange={(e) => setScale(Number(e.target.value))}
					>
						{SCALES.map((x) => (
							<option key={x} value={x}>
								{x === 0.5 ? '×½' : `×${x}`}
							</option>
						))}
					</select>
				</span>
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
										<input
											type="checkbox"
											checked={ticked.includes(n)}
											onChange={() => {
												setTicked(toggle(ticked, n));
												setSent(null);
											}}
										/>
										<span>{ingredientLine(i, scale)}</span>
									</label>
								</li>
							),
						)}
					</ul>
				</div>
			))}
			{/* Sending what's missing: the button says it's going, then that it's there, with the way to the list. */}
			{!cooking && sent !== null ? (
				<p className={s.sent} role="status">
					✓ {sent ? `Sent ${sent} to Groceries` : 'Already on Groceries'}
					<a href="#lists" className={s.sentLink}>
						Open the list
					</a>
				</p>
			) : (
				!cooking &&
				missing.length > 0 && (
					<button
						type="button"
						className={s.cookButton}
						disabled={groceries.isPending}
						onClick={() =>
							groceries.mutate(
								missing.map(({ i }) => `${ingredientLine(i, scale)} · for ${r.title}`),
								{
									onSuccess: (n) => {
										setSent(n);
										setSaid(n ? `Added ${n} to Groceries.` : 'They’re already on Groceries.');
									},
								},
							)
						}
					>
						{groceries.isPending ? 'Sending to Groceries…' : `🛒 Add ${missing.length} missing to Groceries`}
					</button>
				)
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
						{/* Its photos: how it should look by then. */}
						{(stepPhotos(n).length > 0 || parent) && (
							<div className={s.stepPhotos}>
								{stepPhotos(n).map((i) => (
									<button
										key={i.id}
										type="button"
										onClick={() => setBig(i.url)}
										aria-label={`Open step ${n + 1}'s photo`}
									>
										<img src={i.thumbUrl} alt="" loading="lazy" />
									</button>
								))}
								{parent && (
									<button type="button" className={s.addPhoto} onClick={() => choosePhotos(n)}>
										＋ Photo
									</button>
								)}
							</div>
						)}
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
				<div className={s.top}>
					{cover ? (
						<img className={s.cover} src={cover.url} alt="" onClick={() => setBig(cover.url)} />
					) : (
						// No main photo: a picture of its meal.
						<span className={`${s.cover} ${s.defaultPicture}`} aria-hidden="true">
							{mealPicture(r.meal)}
						</span>
					)}
					<div className={s.about}>
						{(!!r.totalMinutes || !!r.activeMinutes || r.servings !== null) && (
							<div className={s.meta}>
								{!!r.totalMinutes && <span>⏱ {minutesText(r.totalMinutes)}</span>}
								{!!r.activeMinutes && r.activeMinutes !== r.totalMinutes && (
									<span>{minutesText(r.activeMinutes)} hands-on</span>
								)}
								{r.servings !== null && <span>Serves {Math.round(r.servings * scale * 10) / 10}</span>}
							</div>
						)}
						{(r.cooked.times > 0 || r.rating !== null) && (
							<div className={s.meta}>
								{r.rating !== null && <span className={s.ratingBadge}>★ {r.rating}</span>}
								{r.cooked.times > 0 && (
									<span>
										Made {r.cooked.times === 1 ? 'once' : `${r.cooked.times} times`}
										{r.cooked.averageMinutes ? ` · usually ${minutesText(r.cooked.averageMinutes)}` : ''}
										{r.cooked.lastAt &&
											` · last ${new Date(r.cooked.lastAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`}
									</span>
								)}
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
							<CookingBar
								startedAt={cookingSince}
								onDone={() => setFinished(Math.max(1, Math.round((Date.now() - cookingSince) / 60_000)))}
							/>
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

				{/* Everyone's stars, and the family's average. */}
				{people.length > 0 && (
					<section className={s.part} aria-label="Ratings">
						<h3 className={s.sectionHead}>
							Ratings
							{r.rating !== null && <span className={s.ratingBadge}>★ {r.rating} family average</span>}
						</h3>
						<ul className={s.ratings}>
							{people.map((m) => {
								const mine = r.ratings.find((x) => x.memberId === m.id)?.stars ?? 0;
								const can = canRate(m);
								return (
									<li key={m.id} className={s.ratingRow}>
										<span className={s.ratingName}>
											<span className={s.ratingDot} style={{ background: m.color }} aria-hidden="true" />
											{m.name}
										</span>
										<span className={s.stars} role="radiogroup" aria-label={`${m.name}'s rating`}>
											{[1, 2, 3, 4, 5].map((n) => (
												<button
													key={n}
													type="button"
													role="radio"
													aria-checked={mine === n}
													aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
													className={n <= mine ? s.starOn : s.star}
													disabled={!can}
													// The same star again takes it back.
													onClick={() => rate.mutate({ id: r.id, memberId: m.id, stars: mine === n ? null : n })}
												>
													★
												</button>
											))}
										</span>
									</li>
								);
							})}
						</ul>
					</section>
				)}
				{r.notes && (
					<section className={s.part} aria-label="Notes">
						<h3 className={s.sectionHead}>Notes</h3>
						<p className={s.notes}>{r.notes}</p>
					</section>
				)}
				{/* Its photos: the main one (on the card and up top) picked from them; grown-ups add more. */}
				{(own.length > 0 || parent) && (
					<section className={s.part} aria-label="Photos">
						<h3 className={s.sectionHead}>Photos</h3>
						<div className={s.photoGrid}>
							{/* No main photo: its meal's picture instead. */}
							{(r.noCover || parent) && own.length > 0 && (
								<div className={`${s.photo} ${r.noCover ? s.photoMain : ''}`}>
									<span className={s.defaultPicture} aria-hidden="true">
										{mealPicture(r.meal)}
									</span>
									{r.noCover ? (
										<span className={s.mainBadge}>★ No main photo</span>
									) : (
										<button
											type="button"
											className={s.photoAction}
											onClick={() => setCover.mutate({ id: r.id, imageId: null })}
										>
											No main photo
										</button>
									)}
								</div>
							)}
							{own.map((i) => (
								<div key={i.id} className={`${s.photo} ${i.id === cover?.id ? s.photoMain : ''}`}>
									<button type="button" onClick={() => setBig(i.url)} aria-label="Open photo">
										<img src={i.thumbUrl} alt="" loading="lazy" />
									</button>
									{i.id === cover?.id ? (
										<span className={s.mainBadge}>★ Main photo</span>
									) : (
										parent && (
											<button
												type="button"
												className={s.photoAction}
												onClick={() => setCover.mutate({ id: r.id, imageId: i.id })}
											>
												Make main photo
											</button>
										)
									)}
									{parent && (
										<button
											type="button"
											className={s.photoRemove}
											aria-label="Remove photo"
											onClick={() => setRemoving(i.id)}
										>
											×
										</button>
									)}
								</div>
							))}
							{parent && (
								<button type="button" className={s.addPhotos} onClick={() => choosePhotos(null)}>
									＋ Add photos
								</button>
							)}
						</div>
					</section>
				)}
				<input
					ref={picker}
					type="file"
					accept="image/*"
					multiple
					hidden
					onChange={(e) => {
						const files = [...(e.target.files ?? [])].slice(0, 6);
						e.target.value = '';
						if (files.length) void addPhotos(files);
					}}
				/>
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
			{finished !== null && (
				<ConfirmDialog
					title="Save this time?"
					confirmLabel="Save time"
					cancelLabel="Don't save"
					safe
					onCancel={() => endCooking(false)}
					onConfirm={() => endCooking(true)}
				>
					You cooked for {minutesText(finished)}. Saved, it goes in this recipe's history: how many times you've made
					it, and how long it usually takes.
				</ConfirmDialog>
			)}
			{removing && (
				<ConfirmDialog
					title="Remove this photo?"
					confirmLabel="Remove"
					onCancel={() => setRemoving(null)}
					onConfirm={() => {
						removeImage.mutate({ id: r.id, imageId: removing });
						setRemoving(null);
					}}
				>
					It's taken out of the recipe for good.
				</ConfirmDialog>
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
