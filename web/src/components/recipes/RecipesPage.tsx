import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useBackStep } from '../../lib/useBackStep';
import { step } from '../../lib/usePage';
import { useImageDrop } from '../../lib/useFlyerDrop';
import { useMeals, useMembers, useRecipeReading, useRecipes } from '../../lib/queries';
import DishIdeas from './DishIdeas';
import PlanAhead from './PlanAhead';
import { mealLabel, plannedOn, takeWanted } from '../../lib/meals';
import { dayKey } from '../../lib/dates';
import { useNow } from '../../lib/useNow';
import { flags } from '../../lib/allergies';
import { coverOf, longestPrep, mealPicture, minutesText, OVERNIGHT, prepBadge, tagEmoji } from '../../lib/recipes';
import type { Recipe } from '../../lib/types';
import { CardsIcon, ListIcon, RowsIcon } from '../ui/icons';
import { Loading, Skeleton } from '../ui/Skeleton';
import Problem, { loadProblem } from '../ui/Problem';
import AddRecipe from './AddRecipe';
import RecipePages, { PAGE_SIZE } from './RecipePages';
import { allProgress, progressText, saveProgress } from '../../lib/recipeProgress';
import RecipeView from './RecipeView';
import s from './Recipes.module.css';

/**
 * The time there is, and which recipes fit it: up to so many minutes, or the long ones (over an hour). A
 * recipe with no time given fits only "Any time".
 */
const TIMES: { label: string; fits: (minutes: number) => boolean }[] = [
	{ label: 'Up to 15 min', fits: (m) => m <= 15 },
	{ label: 'Up to 30 min', fits: (m) => m <= 30 },
	{ label: 'Up to 45 min', fits: (m) => m <= 45 },
	{ label: 'Up to 1 hr', fits: (m) => m <= 60 },
	{ label: 'Over 1 hr', fits: (m) => m > 60 },
];

type Prep = '' | 'tonight' | 'ahead';
const TAB = 'sprig:recipes-tab';
type View = 'cards' | 'list' | 'rows';
const VIEW = 'sprig:recipes-view';
const VIEWS: { view: View; label: string; Icon: () => JSX.Element }[] = [
	{ view: 'cards', label: 'Cards', Icon: CardsIcon },
	{ view: 'rows', label: 'Pictures and words', Icon: RowsIcon },
	{ view: 'list', label: 'List', Icon: ListIcon },
];

/**
 * The family's recipes (docs/recipes.md), in two tabs. Recipes: each saved recipe as a card with its picture
 * (and a badge for prep the night before or earlier), narrowed by the time there is, the meal, a protein or
 * a type, prep ahead, or a tag. Plan ahead: the days ahead, to put recipes on. A grown-up adds a recipe from
 * pictures or a link (+ Recipe).
 */
export default function RecipesPage({
	parent,
	addNow,
	onAdding,
}: {
	parent: boolean;
	/** Add a recipe asked for elsewhere (the phone's +): opened here, and then `onAdding`. */
	addNow?: boolean;
	onAdding?: () => void;
}) {
	const recipesQuery = useRecipes();
	const recipes = recipesQuery.data ?? [];
	const [adding, setAdding] = useState(false);
	useEffect(() => {
		if (!addNow) return;
		setAdding(true);
		onAdding?.();
	}, [addNow, onAdding]);
	// Dish ideas open (from a themed day: for its kind).
	const [ideas, setIdeas] = useState<{ kind: string } | null>(null);
	const reading = useRecipeReading().data;
	// Pictures dropped onto the page (a computer, or a tablet beside Photos): straight into reading.
	const [dropped, setDropped] = useState<File[] | null>(null);
	const takeDrop = useCallback((images: File[]) => {
		setDropped(images.slice(0, 6));
		setAdding(true);
	}, []);
	const notAPicture = useCallback(() => setDropped(null), []);
	const dragging = useImageDrop(parent, takeDrop, notAPicture);
	// The recipe open; one asked for from elsewhere (the calendar, Today) opens first.
	const [open, setOpen] = useState<string | null>(takeWanted);
	// The recipes' scrolling area: reaching its end brings the next page.
	const scroller = useRef<HTMLDivElement>(null);
	// Filters: one chip from each row at most.
	// Which of TIMES (its place), or null for any time.
	const [time, setTime] = useState<number | null>(null);
	const [tag, setTag] = useState<string | null>(null);
	const [familyTag, setFamilyTag] = useState<string | null>(null);
	// Ready tonight (no prep the night before or earlier), or only the ones that need it.
	const [prep, setPrep] = useState<Prep>('');
	// The tab, remembered on this device.
	const [tab, setTab] = useState<'recipes' | 'plan'>(() => {
		try {
			return localStorage.getItem(TAB) === 'plan' ? 'plan' : 'recipes';
		} catch {
			return 'recipes';
		}
	});
	// Cards, a list, or rows, remembered on this device.
	const [view, setView] = useState<View>(() => {
		try {
			const kept = localStorage.getItem(VIEW);
			return VIEWS.some((v) => v.view === kept) ? (kept as View) : 'cards';
		} catch {
			return 'cards';
		}
	});
	const pickView = (next: View) => {
		setView(next);
		try {
			localStorage.setItem(VIEW, next);
		} catch {
			// Not kept (a private window): cards next time.
		}
	};
	const pickTab = (next: 'recipes' | 'plan') => {
		setTab(next);
		try {
			localStorage.setItem(TAB, next);
		} catch {
			// Not kept (a private window): Recipes next time.
		}
	};
	// The kinds worth showing: the meals, proteins and types the recipes have; and the family's own tags.
	const tags = [...new Set(recipes.flatMap((r) => [r.meal, ...r.proteins, ...r.types]))].sort();
	const familyTags = [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
	const shown = recipes.filter(
		(r) =>
			(time === null || (!!r.totalMinutes && TIMES[time].fits(r.totalMinutes))) &&
			(tag === null || r.meal === tag || r.proteins.includes(tag) || r.types.includes(tag)) &&
			(familyTag === null || r.tags.includes(familyTag)) &&
			(prep === '' || (prep === 'tonight') === longestPrep(r) < OVERNIGHT),
	);
	const opened = recipes.find((r) => r.id === open) ?? null;
	// An open recipe is a step of its own: Back or a swipe closes it before leaving Recipes. Not the one a
	// link brought us here for (a meal on Today): Back from it goes straight back where the link was.
	const linked = useRef(open !== null && step().from ? open : null);
	useBackStep(!!opened && opened.id !== linked.current, () => setOpen(null));
	// Recipes left partway on this device (read again as one closes, or one is cleared).
	const [, setCleared] = useState(0);
	const viewing = allProgress().flatMap((p) => {
		const r = recipes.find((x) => x.id === p.id);
		return r ? [{ r, p }] : [];
	});
	// What's being cooked today (Cook today, or planned for today): a plain list at the top.
	const today = dayKey(useNow());
	const cookingToday = plannedOn(useMeals().data, today).flatMap((m) => {
		const r = recipes.find((x) => x.id === m.recipeId);
		return r ? [{ m, r }] : [];
	});

	return (
		<section className={s.page} aria-label="Recipes">
			<header className={s.pageHead}>
				<h1 className={s.pageTitle}>Recipes</h1>
				{parent && (
					<span className={s.headButtons}>
						{/* Out of ideas: dishes to try (with Claude on the server). */}
						{reading?.on && (
							<button type="button" className={s.ideasButton} onClick={() => setIdeas({ kind: '' })}>
								✨ Dish ideas
							</button>
						)}
						<button type="button" className={s.add} onClick={() => setAdding(true)}>
							＋ Recipe
						</button>
					</span>
				)}
			</header>

			{/* Two tabs: the recipes saved over time, and the days ahead to put them on. */}
			<div className={`${s.tabs} ${s.pageTabs}`} role="tablist" aria-label="Recipes or plan ahead">
				<button type="button" role="tab" aria-selected={tab === 'recipes'} onClick={() => pickTab('recipes')}>
					Recipes
				</button>
				<button type="button" role="tab" aria-selected={tab === 'plan'} onClick={() => pickTab('plan')}>
					Plan ahead
				</button>
			</div>
			{tab === 'plan' ? (
				<div className={s.scroll}>
					<PlanAhead
						recipes={recipes}
						parent={parent}
						kinds={[...tags, ...familyTags]}
						onOpen={setOpen}
						onIdeas={(kind) => setIdeas({ kind })}
					/>
				</div>
			) : (
				<div className={s.scroll} ref={scroller}>
					{cookingToday.length > 0 && (
						<section className={s.viewing} aria-label="Cooking today">
							<h2 className={s.viewingTitle}>Cooking today</h2>
							<ul className={s.todayList}>
								{cookingToday.map(({ m, r }) => (
									<li key={m.id}>
										<button type="button" className={s.todayRow} onClick={() => setOpen(r.id)}>
											<span className={s.todayMeal}>{mealLabel(m.meal)}</span>
											<span className={s.todayTitle}>{r.title}</span>
										</button>
									</li>
								))}
							</ul>
						</section>
					)}
					{viewing.length > 0 && (
						<section className={s.viewing} aria-label="Currently viewing">
							<h2 className={s.viewingTitle}>Currently viewing</h2>
							<ul className={s.viewingList}>
								{viewing.map(({ r, p }) => {
									const cover = coverOf(r);
									return (
										<li key={r.id} className={s.viewingCard}>
											<button type="button" className={s.viewingOpen} onClick={() => setOpen(r.id)}>
												{cover ? (
													<img className={s.viewingImage} src={cover.thumbUrl} alt="" />
												) : (
													<span className={`${s.viewingImage} ${s.defaultPicture}`} aria-hidden="true">
														{mealPicture(r.meal)}
													</span>
												)}
												<span className={s.cardText}>
													<span className={s.cardTitle}>{r.title}</span>
													<span className={s.cardMeta}>{progressText(p, r.ingredients.length, r.steps.length)}</span>
												</span>
											</button>
											<button
												type="button"
												className={s.viewingClear}
												aria-label={`Clear the ticks in ${r.title}`}
												title="Clear the ticks"
												onClick={() => {
													saveProgress(r.id, null);
													setCleared((n) => n + 1);
												}}
											>
												✕
											</button>
										</li>
									);
								})}
							</ul>
						</section>
					)}
					{recipes.length > 0 && (
						// Side by side: the time there is, a kind (a meal, a protein, a type), and the family's tags.
						<div className={s.filters}>
							<span className={s.select}>
								<select
									aria-label="Time you have"
									value={time === null ? '' : String(time)}
									onChange={(e) => setTime(e.target.value ? Number(e.target.value) : null)}
								>
									<option value="">Any time</option>
									{TIMES.map(({ label }, i) => (
										<option key={label} value={String(i)}>
											{label}
										</option>
									))}
								</select>
							</span>

							{tags.length > 1 && (
								<span className={`${s.select} ${s.kind}`}>
									<select aria-label="Kind" value={tag ?? ''} onChange={(e) => setTag(e.target.value || null)}>
										<option value="">Any kind</option>
										{tags.map((t) => (
											<option key={t} value={t}>
												{t[0].toUpperCase() + t.slice(1)}
											</option>
										))}
									</select>
								</span>
							)}
							{recipes.some((r) => longestPrep(r) >= OVERNIGHT) && (
								<span className={s.select}>
									<select aria-label="Prep ahead" value={prep} onChange={(e) => setPrep(e.target.value as Prep)}>
										<option value="">Any prep</option>
										<option value="tonight">🍳 Ready tonight</option>
										<option value="ahead">🌙 Needs prep ahead</option>
									</select>
								</span>
							)}
							{familyTags.length > 0 && (
								<span className={s.select}>
									<select
										aria-label="Tag"
										value={familyTag ?? ''}
										onChange={(e) => setFamilyTag(e.target.value || null)}
									>
										<option value="">Any tag</option>
										{familyTags.map((t) => (
											<option key={t} value={t}>
												{tagEmoji(t)} {t}
											</option>
										))}
									</select>
								</span>
							)}
							{/* How the recipes show: cards, a list, or a small picture beside the words. */}
							<span className={s.views} role="group" aria-label="Show as">
								{VIEWS.map((v) => (
									<button
										key={v.view}
										type="button"
										className={s.viewButton}
										aria-label={v.label}
										title={v.label}
										aria-pressed={view === v.view}
										onClick={() => pickView(v.view)}
									>
										<v.Icon />
									</button>
								))}
							</span>
						</div>
					)}
					{recipesQuery.isError ? (
						<Problem
							kind="page"
							message={loadProblem('recipes', recipesQuery.error)}
							onRetry={() => void recipesQuery.refetch()}
						/>
					) : recipesQuery.isPending ? (
						<Loading label="Loading recipes" className={s.grid}>
							{Array.from({ length: 6 }, (_, i) => (
								<Skeleton key={i} height="13rem" />
							))}
						</Loading>
					) : recipes.length === 0 ? (
						<p className={s.none}>
							No recipes yet.{' '}
							{parent
								? 'Tap ＋ Recipe to add one from a screenshot, a photo of a cookbook page, or a link.'
								: 'A grown-up adds them.'}
						</p>
					) : shown.length === 0 ? (
						<p className={s.none}>Nothing fits those. Pick Any time, Any kind, Any prep or Any tag to see more.</p>
					) : (
						// A page at a time; back to page 1 when the filters or the view change.
						<RecipePages
							key={[view, time, tag, familyTag, prep].join('|')}
							items={shown}
							size={PAGE_SIZE[view]}
							scroller={scroller}
							listClass={view === 'cards' ? s.grid : s.rows}
							render={(r) => <RecipeCard recipe={r} view={view} onOpen={() => setOpen(r.id)} />}
						/>
					)}
				</div>
			)}

			{adding && (
				<AddRecipe
					dropped={dropped}
					onClose={() => {
						setAdding(false);
						setDropped(null);
					}}
					onAdded={(r) => setOpen(r.id)}
				/>
			)}
			{ideas && (
				<DishIdeas
					kinds={tags}
					kind={ideas.kind}
					onClose={() => setIdeas(null)}
					onOpenRecipe={(id) => {
						setIdeas(null);
						setOpen(id);
					}}
				/>
			)}
			{dragging && (
				<div className={s.drop} aria-live="polite">
					<span className={s.dropBox}>Drop the recipe's pictures</span>
				</div>
			)}
			{opened && (
				<RecipeView
					recipe={opened}
					parent={parent}
					back={
						opened.id === linked.current && step().from
							? { to: step().from!, onBack: () => history.back() }
							: undefined
					}
					onClose={() => {
						// Closed by hand: open again, it's a step like any other.
						linked.current = null;
						setOpen(null);
					}}
				/>
			)}
		</section>
	);
}

/** "korean" → "Korean". */
const capital = (w: string | null) => (w ? w[0].toUpperCase() + w.slice(1) : null);

/**
 * A recipe among the others: its picture (big on a card, small beside the words in rows, none in a list),
 * name, time and kind, prep ahead, and the family's tags.
 */
function RecipeCard({ recipe: r, view, onOpen }: { recipe: Recipe; view: View; onOpen: () => void }) {
	// Someone's allergy in it: a ⚠ on the card, with who.
	const people = useMembers().data ?? [];
	const warn = flags(r.ingredients, people).map((f) => f.person.name);
	const cover = coverOf(r);
	const badge = prepBadge(r);
	return (
		<button
			type="button"
			className={`${s.card} ${view === 'list' ? s.cardList : view === 'rows' ? s.cardRow : ''}`}
			onClick={onOpen}
		>
			{/* A list is words only. */}
			{view === 'list' ? null : cover ? (
				<img className={s.cardImage} src={cover.thumbUrl} alt="" loading="lazy" />
			) : (
				// No main photo: a picture of its meal.
				<span className={`${s.cardImage} ${s.defaultPicture}`} aria-hidden="true">
					{mealPicture(r.meal)}
				</span>
			)}
			<span className={s.cardText}>
				<span className={s.cardTitle}>{r.title}</span>
				{warn.length > 0 && <span className={s.cardWarn}>⚠ Allergy: {warn.join(', ')}</span>}
				{r.tags.length > 0 && (
					<span className={s.cardTags}>
						{r.tags.map((t) => (
							<span key={t} className={s.familyTag}>
								<span aria-hidden="true">{tagEmoji(t)}</span> {t}
							</span>
						))}
					</span>
				)}
				{badge && <span className={s.cardPrep}>{badge}</span>}
				<span className={s.cardMeta}>
					{[
						r.rating !== null ? `★ ${r.rating}` : null,
						r.totalMinutes ? minutesText(r.totalMinutes) : null,
						capital(r.types[0] ?? r.proteins[0] ?? null),
						r.cooked.times > 0 ? `made ${r.cooked.times}×` : null,
					]
						.filter(Boolean)
						.join(' · ')}
				</span>
			</span>
		</button>
	);
}
