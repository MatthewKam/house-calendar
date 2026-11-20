import { useEffect, useRef, useState } from 'react';
import { BackButton } from '../ui/BackButton';
import type { Page } from '../nav/NavBar';
import { useMutationState } from '@tanstack/react-query';
import {
	useAddToGroceries,
	useAuthStatus,
	useCookActions,
	useCookRoom,
	useCookTogether,
	useLiveRecipeShopping,
	useMealActions,
	useMeals,
	useMembers,
	useRecipeActions,
	useRecipeShopping,
	useRecipeShoppingActions,
	useRecipes,
} from '../../lib/queries';
import {
	aheadText,
	prepBadge,
	coverOf,
	ingredientLine,
	mealPicture,
	minutesText,
	tagEmoji,
	toJpeg,
} from '../../lib/recipes';
import { dayWord, mealLabel } from '../../lib/meals';
import { dayKey, timeLabel } from '../../lib/dates';
import { cookBase, cookId, cookLink, untilWords } from '../../lib/cook';
import { api } from '../../lib/api';
import { progressOf, saveProgress } from '../../lib/recipeProgress';
import type { CookProgress, CookTimer } from '../../../../shared/cook.ts';
import { useNow } from '../../lib/useNow';
import { flags } from '../../lib/allergies';
import type { MealPlan, Member, Recipe } from '../../lib/types';
import { PHONE, PHONE_SIDEWAYS, TOUCH, useMediaQuery } from '../../lib/useMediaQuery';
import { useWakeLock } from '../../lib/useWakeLock';
import Sheet from '../ui/Sheet';
import Problem from '../ui/Problem';
import { ShoppingButton, TickedBy } from '../ui/ShoppingTogether';
import ConfirmDialog from '../ui/ConfirmDialog';
import CookingBar from './CookingBar';
import { CookingWith, DoneBy } from './CookingWith';
import CookNotes from './CookNotes';
import PhotoViewer from './PhotoViewer';
import PlanIt from './PlanIt';
import RemindMe from './RemindMe';
import RecipeForm from './RecipeForm';
import TagPicker from './TagPicker';
import buttons from '../ui/Buttons.module.css';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';
import { Button, IconButton } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { Select, TextArea } from '../ui/Field';

/** How many times the recipe: for a smaller meal, or a crowd. */
const SCALES = [0.5, 1, 2, 4, 6, 8];

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
 * the rest go on the Groceries list in a tap; or, shopping together, of what's in the basket, ticked on
 * each shopper's phone at once (server/recipeShopping.ts). Cooking (Start cooking): a timer counts up, timers can be
 * set, the checklist clears to tick off what's prepped or gathered, steps grey out as they're done, and it fills the screen.
 * Big screens: ingredients and steps side by side; phones: one or the other. Sections with nothing in
 * them aren't shown. The screen stays on while it's open.
 */
export default function RecipeView({
	recipe: r,
	parent,
	onClose,
	back,
}: {
	recipe: Recipe;
	parent: boolean;
	onClose: () => void;
	/** Opened by a link on another page (a meal on Today): "‹ Today" at the top left goes back there. */
	back?: { to: Page; onBack: () => void };
}) {
	const { update, remove, addImages, setCover, removeImage, logCook, rate, setTags } = useRecipeActions();
	// Done cooking: how long it took, while it's asked whether to keep that (and a note for next time).
	const [finished, setFinished] = useState<number | null>(null);
	const [cookNote, setCookNote] = useState('');
	const endCooking = (save: boolean) => {
		if (save && finished) logCook.mutate({ id: r.id, minutes: finished, note: cookNote.trim() || null });
		setFinished(null);
		setCookNote('');
		// Cooking together: the others see this cook's done.
		if (joined && base)
			void api
				.cookMe(base, { cookId: mine, name: myName, progress: { ...progress, doneAt: Date.now() } })
				.catch(() => {});
		setJoined(false);
		// Cooked: it starts fresh next time, and leaves Currently viewing.
		setHave([]);
		setPrepped([]);
		setStepsDone([]);
		setTimers([]);
		setCookingSince(null);
	};
	// The family's tags: picking them, from the ones used across the book.
	const [tagging, setTagging] = useState(false);
	// Plan it: on a day (or a planned one, to move).
	const [planning, setPlanning] = useState<MealPlan | 'new' | null>(null);
	const [reminding, setReminding] = useState(false);
	const today = dayKey(useNow());
	const planned = (useMeals().data?.meals ?? []).filter((m) => m.recipeId === r.id && m.day >= today);
	// Cook today: on today's dinner in one tap, so it shows on everyone's Today; once on, its day shows instead.
	const { plan } = useMealActions();
	const onToday = planned.some((m) => m.day === today);
	const knownTags = [...new Set((useRecipes().data ?? []).flatMap((x) => x.tags))];
	// Ratings: everyone in the family's, set on a grown-up's screen (not a kid's own device or a locked wall).
	// Each grown-up changes their own and the kids'; the account holder anyone's.
	const people = useMembers().data ?? [];
	// Anyone's allergies in it: who and what, and which ingredient rows.
	const allergyFlags = flags(r.ingredients, people);
	const flaggedRows = new Set(allergyFlags.flatMap((f) => f.allergies.flatMap((a) => a.rows)));
	const auth = useAuthStatus().data;
	const canRate = (m: Member) =>
		!auth?.signedIn || (auth.parent && (auth.holder || auth.memberId === m.id || !m.guardian));
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
	// Where it was left on this device (lib/recipeProgress.ts), if within a day.
	const [left] = useState(() => progressOf(r.id));
	const [scale, setScale] = useState(left?.scale ?? 1);
	// Ingredients ticked: what's in the house (planning), or what's prepped (cooking), by index.
	const [have, setHave] = useState<number[]>(left?.have ?? []);
	const [prepped, setPrepped] = useState<number[]>(left?.prepped ?? []);
	const [stepsDone, setStepsDone] = useState<number[]>(left?.steps ?? []);
	const [cookingSince, setCookingSince] = useState<number | null>(left?.cookingSince ?? null);
	const [tab, setTab] = useState<'ingredients' | 'steps'>('ingredients');
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	// A photo opened big (its id, to delete it from there).
	const [big, setBig] = useState<{ id: string; url: string } | null>(null);
	const [said, setSaid] = useState<string | null>(null);
	// Sent to Groceries: how many went on (shown with a link to the list) until the ticks change.
	const [sent, setSent] = useState<number | null>(null);
	// Both asked every time (hooks can't be skipped).
	const upright = useMediaQuery(PHONE);
	const sideways = useMediaQuery(PHONE_SIDEWAYS);
	const phone = upright || sideways;
	// Phones and tablets: the recipe fills the screen, its × pinned at the top; a computer's stays a card.
	const fullScreen = useMediaQuery(TOUCH) || phone;
	// Cooking from it: no sleeping screen while it's open.
	useWakeLock(true);

	// Cooking together (server/cook.ts): the recipe's link while there is one, and this device cooking
	// along with it (joined). Each cook keeps their own ticks and timers; the others' show beside them.
	const [timers, setTimers] = useState<CookTimer[]>(left?.timers ?? []);
	// Each change kept, so it opens where it was (and shows under Currently viewing). Only a change:
	// opening it doesn't start its day again.
	const kept = useRef(JSON.stringify([have, prepped, stepsDone, scale, cookingSince, timers]));
	useEffect(() => {
		const now = JSON.stringify([have, prepped, stepsDone, scale, cookingSince, timers]);
		if (now === kept.current) return;
		kept.current = now;
		saveProgress(r.id, { have, prepped, steps: stepsDone, scale, cookingSince, timers });
	}, [r.id, have, prepped, stepsDone, scale, cookingSince, timers]);
	const room = useCookRoom(r.id).data?.room ?? null;
	const cookActions = useCookActions(r.id);
	const household = auth?.signedIn ? auth.household?.id : undefined;
	const canCookTogether = !!household && auth?.signedIn && auth.role !== 'kid';
	const base = room && household ? cookBase(household, room.secret) : null;
	const mine = cookId();
	const myName = (auth?.signedIn && auth.me?.name) || 'Someone';
	const [joined, setJoined] = useState(false);
	const progress: CookProgress = { startedAt: cookingSince, prepped, steps: stepsDone, timers, doneAt: null };
	const together = useCookTogether(
		joined ? base : null,
		joined && cookingSince !== null ? { name: myName, progress } : null,
	);
	const cooks = (joined ? together.data?.people : room?.people) ?? [];
	const others = cooks.filter((p) => p.cookId !== mine);
	// Everyone for the dots, this cook as they are here (not as last saved).
	const everyone = cooks.map((p) => (p.cookId === mine && joined ? { ...p, progress } : p));
	// Coming back to a recipe being cooked together (a day-long one, say): carries on where this cook was.
	const restored = useRef(false);
	useEffect(() => {
		if (restored.current || !room) return;
		restored.current = true;
		const was = room.people.find((p) => p.cookId === mine)?.progress;
		if (!was?.startedAt || was.doneAt) return;
		setCookingSince(was.startedAt);
		setPrepped(was.prepped);
		setStepsDone(was.steps);
		setTimers(was.timers);
		setJoined(true);
	}, [room, mine]);
	/** The link, sent with the phone's own share sheet (or copied). */
	async function shareLink(secret: string) {
		if (!household) return;
		const url = cookLink(household, secret);
		try {
			if (navigator.share) await navigator.share({ title: `Cook ${r.title} with me`, url });
			else {
				await navigator.clipboard.writeText(url);
				setSaid('Copied the link. Send it to whoever’s cooking along.');
			}
		} catch {
			// Closed the share sheet: nothing to say.
		}
	}
	/** Cooking, from the start: the checklist and steps clear, and the timers go. */
	const startCooking = () => {
		setPrepped([]);
		setStepsDone([]);
		setTimers([]);
		setCookingSince(Date.now());
	};
	const [ending, setEnding] = useState(false);

	// Shopping together from it: the ticks are shared with the other phones, in place of this one's own.
	const me = auth?.signedIn ? auth.memberId : null;
	const shoppingQuery = useRecipeShopping(r.id);
	const shoppers = shoppingQuery.data?.shopping ?? [];
	const shoppingHere = shoppers.includes(me);
	useLiveRecipeShopping(r.id, shoppingHere);
	const shop = useRecipeShoppingActions(r.id);
	const tickedBy = new Map((shoppingHere ? (shoppingQuery.data?.ticks ?? []) : []).map((t) => [t.index, t.by]));
	// Ticks of this phone's on their way to the others.
	const savingTicks = new Set(
		useMutationState({
			filters: { mutationKey: ['recipe-shopping', r.id], status: 'pending' },
			select: (m) => (m.state.variables as { index?: unknown } | undefined)?.index,
		}),
	);
	const unsynced =
		shoppingHere &&
		(shoppingQuery.fetchStatus === 'paused' || shoppingQuery.errorUpdatedAt > shoppingQuery.dataUpdatedAt);
	const inHand = shoppingHere ? [...tickedBy.keys()] : have;

	const cooking = cookingSince !== null;
	const ticked = cooking ? prepped : inHand;
	const setTicked = cooking ? setPrepped : setHave;
	const cover = coverOf(r);
	// The dish's own photos (not a step's), the main one among them.
	const own = r.images.filter((i) => i.step === null);
	const stepPhotos = (n: number) => r.images.filter((i) => i.step === n);
	const groups = [...new Set(r.ingredients.map((i) => i.group))];
	const tags = [r.meal, ...r.proteins, ...r.types];
	const missing = r.ingredients.map((i, n) => ({ i, n })).filter(({ n }) => !inHand.includes(n));
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
				<Select aria-label="How many times the recipe" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
					{SCALES.map((x) => (
						<option key={x} value={x}>
							{x === 0.5 ? '×½' : `×${x}`}
						</option>
					))}
				</Select>
			</div>
			{!cooking && (
				<div className={s.shopRow}>
					<ShoppingButton
						shopping={shoppers}
						me={me}
						members={people}
						onChange={(on) =>
							shop.shopping.mutate(on, {
								// What was ticked here as in the house comes along, shared.
								onSuccess: (state) => {
									if (!on) return;
									const shared = new Set(state.ticks.map((t) => t.index));
									for (const n of have) if (!shared.has(n)) shop.tick.mutate({ index: n, done: true, by: me });
								},
							})
						}
					/>
				</div>
			)}
			{!cooking && unsynced && (
				<Problem
					message={`📶 Not synced since ${timeLabel(new Date(shoppingQuery.dataUpdatedAt))}: ticks from other phones won’t show until the signal’s back.`}
				/>
			)}
			<p className={s.hint}>
				{cooking
					? 'Tick each one once it’s prepped or out.'
					: shoppingHere
						? 'Tick what’s in the basket. It shows on the other phones too.'
						: 'Tick what you have.'}
			</p>
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
												if (!cooking && shoppingHere) shop.tick.mutate({ index: n, done: !ticked.includes(n), by: me });
												else setTicked(toggle(ticked, n));
												setSent(null);
											}}
										/>
										<span>{ingredientLine(i, scale)}</span>
										{!cooking && savingTicks.has(n) && (
											<span className={s.hint} title="Saving…">
												↻
											</span>
										)}
										{!cooking && tickedBy.get(n) && <TickedBy by={tickedBy.get(n)!} members={people} />}
										{cooking && <DoneBy people={everyone} done={(p) => p.progress.prepped.includes(n)} />}
										{flaggedRows.has(n) && (
											<span className={s.allergyMark} title="Someone's allergy">
												⚠
											</span>
										)}
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
					<Button
						size="sm"

						disabled={groceries.isPending}
						onClick={() =>
							groceries.mutate(
								{ section: r.title, lines: missing.map(({ i }) => ingredientLine(i, scale)) },
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
					</Button>
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
							{cooking && <DoneBy people={everyone} done={(p) => p.progress.steps.includes(n)} />}
						</button>
						{/* Its photos: how it should look by then. */}
						{(stepPhotos(n).length > 0 || parent) && (
							<div className={s.stepPhotos}>
								{stepPhotos(n).map((i) => (
									<button key={i.id} type="button" onClick={() => setBig(i)} aria-label={`Open step ${n + 1}'s photo`}>
										<img src={i.thumbUrl} alt="" loading="lazy" />
									</button>
								))}
								{parent && (
									<Button size="sm" onClick={() => choosePhotos(n)}>
										＋ Photo
									</Button>
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
			<Sheet label={r.title} onClose={onClose} className={`${s.view} ${cooking || fullScreen ? sheet.full : ''}`}>
				<header className={sheet.head}>
					{/* "‹ Today" above the name, the name keeping its place on the left. */}
					<div className={s.titleWithBack}>
						{back && <BackButton to={back.to} onBack={back.onBack} />}
						<h2 className={sheet.heading}>{r.title}</h2>
					</div>
					<span className={sheet.spacer} />
					<button type="button" className={s.iconButton} onClick={() => void share()} aria-label="Share the recipe">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							{/* A box with an arrow up out of it. */}
							<path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
						</svg>
					</button>
					<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
				</header>

				{/* The top: its photo, and what to know before starting. */}
				<div className={s.top}>
					{cover ? (
						<img className={s.cover} src={cover.url} alt="" onClick={() => setBig(cover)} />
					) : (
						// No main photo: a picture of its meal.
						<span className={`${s.cover} ${s.defaultPicture}`} aria-hidden="true">
							{mealPicture(r.meal)}
						</span>
					)}
					<div className={s.about}>
						{allergyFlags.length > 0 && (
							<div className={s.allergyBanner} role="note">
								{allergyFlags.map((f) => (
									<b key={f.person.id}>
										⚠ {f.person.name}: {f.allergies.map((a) => a.name).join(', ')}
									</b>
								))}
								<span>Going by the ingredients' words: a help, not a guarantee. Check labels too.</span>
							</div>
						)}
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
						{/* Prep ahead (marinate overnight, thaw a day ahead): up top, with what to do about it. */}
						{r.prepAhead.length > 0 && (
							<div className={s.ahead}>
								<b>{prepBadge(r) ?? '⏰ Ahead of time'}</b>
								<ul className={s.aheadSteps}>
									{r.prepAhead.map((p) => (
										<li key={p.what}>
											{p.what}, {aheadText(p.hoursBefore)}
										</li>
									))}
								</ul>
								{parent && (
									<span className={s.aheadButtons}>
										<Button icon="📅" onClick={() => setPlanning('new')}>
											Pick a cook day
										</Button>
										<Button icon="⏰" onClick={() => setReminding(true)}>
											Just remind me
										</Button>
									</span>
								)}
							</div>
						)}
						{(r.tags.length > 0 || parent) && (
							<div className={s.tags}>
								{r.tags.map((t) => (
									<span key={t} className={s.familyTag}>
										<span aria-hidden="true">{tagEmoji(t)}</span> {t}
									</span>
								))}
								{parent && (
									<Button size="sm" icon="🏷️" onClick={() => setTagging(true)}>
										{r.tags.length ? 'Edit tags' : 'Add tags'}
									</Button>
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
						{(planned.length > 0 || (parent && r.prepAhead.length === 0)) && (
							<div className={s.tags}>
								{planned.map((m) => (
									<button
										key={m.id}
										type="button"
										className={s.planned}
										disabled={!parent}
										onClick={() => setPlanning(m)}
									>
										<span className={buttons.buttonIcon}>📅&nbsp;</span>
										<span className={buttons.buttonText}>
											{mealLabel(m.meal)}, {dayWord(m.day, today)}
										</span>
									</button>
								))}
								{parent && r.prepAhead.length === 0 && !onToday && (
									<Button
										size="sm"
										icon="🍳"

										disabled={plan.isPending}
										onClick={() => plan.mutate({ day: today, meal: 'dinner', recipeId: r.id, reminders: [] })}
									>
										Cook today
									</Button>
								)}
								{parent && r.prepAhead.length === 0 && (
									<Button size="sm" icon="📅" onClick={() => setPlanning('new')}>
										Pick a cook day
									</Button>
								)}
							</div>
						)}
						{cooking ? (
							<>
								<CookingBar
									startedAt={cookingSince}
									timers={timers}
									onTimers={setTimers}
									onDone={() => setFinished(Math.max(1, Math.round((Date.now() - cookingSince) / 60_000)))}
								/>
								{/* Cooking together: the link, how long it lasts, ending it, and the others. */}
								{canCookTogether &&
									(!room ? (
										// Starting one is a grown-up's (cooking needs one); anyone can join one under way.
										parent && (
											<Button
												size="sm"
												icon="👩‍🍳"

												disabled={cookActions.start.isPending}
												onClick={() =>
													cookActions.start.mutate(undefined, {
														onSuccess: ({ room: made }) => {
															setJoined(true);
															void shareLink(made.secret);
														},
													})
												}
											>
												Cook together
											</Button>
										)
									) : (
										<>
											<div className={s.cookTogether}>
												<span>👩‍🍳 Cooking together until {untilWords(room.until)}</span>
												{joined ? (
													<Button size="sm" onClick={() => void shareLink(room.secret)}>
														Send the link
													</Button>
												) : (
													<Button size="sm" onClick={() => setJoined(true)}>
														Join
													</Button>
												)}
												{/* How long it lasts, and ending it: a grown-up's. */}
												{parent && (
													<>
														<Select
															aria-label="How long the link lasts"
															value=""
															onChange={(e) => e.target.value && cookActions.length.mutate(Number(e.target.value))}
														>
															<option value="">Keep it for…</option>
															<option value="24">A day from now</option>
															<option value="48">2 days</option>
															<option value="72">3 days</option>
															<option value="168">A week</option>
														</Select>
														<Button variant="link" size="sm" className={s.textLink} onClick={() => setEnding(true)}>
															End
														</Button>
													</>
												)}
											</div>
											{joined && (
												<CookingWith others={others} steps={r.steps.length} ingredients={r.ingredients.length} />
											)}
										</>
									))}
							</>
						) : (
							<>
								{/* Someone's cooking it together: joining starts cooking here too. */}
								{canCookTogether && room && others.some((p) => !p.progress.doneAt) && (
									<Button
										size="sm"
										icon="👩‍🍳"

										onClick={() => {
											startCooking();
											setJoined(true);
										}}
									>
										{others
											.filter((p) => !p.progress.doneAt)
											.map((p) => p.name)
											.join(', ')}{' '}
										cooking this · Join
									</Button>
								)}
								<Button variant="primary" size="lg" className={s.startCooking} onClick={startCooking}>
									Start cooking
								</Button>
							</>
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
					<Segmented
						tabs
						label="Recipe"
						value={tab}
						onChange={setTab}
						options={[
							{ id: 'ingredients', label: 'Ingredients' },
							{ id: 'steps', label: 'Steps' },
						]}
					/>
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
				<CookNotes recipe={r} parent={parent} people={people} />
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
										<Button
											variant="link"
											size="sm"
											className={s.photoAction}

											onClick={() => setCover.mutate({ id: r.id, imageId: null })}
										>
											No main photo
										</Button>
									)}
								</div>
							)}
							{own.map((i) => (
								<div key={i.id} className={`${s.photo} ${i.id === cover?.id ? s.photoMain : ''}`}>
									<button type="button" onClick={() => setBig(i)} aria-label="Open photo">
										<img src={i.thumbUrl} alt="" loading="lazy" />
									</button>
									{i.id === cover?.id ? (
										<span className={s.mainBadge}>★ Main photo</span>
									) : (
										parent && (
											<Button
												variant="link"
												size="sm"
												className={s.photoAction}

												onClick={() => setCover.mutate({ id: r.id, imageId: i.id })}
											>
												Make main photo
											</Button>
										)
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
						<Button variant="danger" onClick={() => setDeleting(true)}>
							Delete
						</Button>
					)}
					<span className={sheet.spacer} />
					{parent && <Button onClick={() => setEditing(true)}>Edit</Button>}
					<Button variant="primary" onClick={onClose}>
						Done
					</Button>
				</div>
			</Sheet>
			{big && (
				<PhotoViewer
					url={big.url}
					onClose={() => setBig(null)}
					// Deleting asks first, over the recipe (the viewer closes).
					onDelete={
						parent
							? () => {
									setRemoving(big.id);
									setBig(null);
								}
							: undefined
					}
				/>
			)}
			{ending && (
				<ConfirmDialog
					title="End cooking together?"
					confirmLabel="End it"
					onCancel={() => setEnding(false)}
					onConfirm={() => {
						setEnding(false);
						setJoined(false);
						cookActions.end.mutate();
					}}
				>
					The link stops working for everyone cooking along. Your own ticks and timers stay.
				</ConfirmDialog>
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
					{parent && (
						<TextArea
							className={s.noteBox}
							rows={3}
							maxLength={1000}
							aria-label="A note for next time"
							placeholder="A note for next time, if any (used half the sugar, kids loved it)"
							value={cookNote}
							onChange={(e) => setCookNote(e.target.value)}
						/>
					)}
				</ConfirmDialog>
			)}
			{tagging && (
				<TagPicker
					initial={r.tags}
					known={knownTags}
					onClose={() => setTagging(false)}
					onSave={(t) => {
						setTags.mutate({ id: r.id, tags: t });
						setTagging(false);
					}}
				/>
			)}
			{planning && (
				<PlanIt recipe={r} plan={planning === 'new' ? undefined : planning} onClose={() => setPlanning(null)} />
			)}
			{reminding && <RemindMe recipe={r} onClose={() => setReminding(false)} />}
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
