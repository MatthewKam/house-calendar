import { useCallback, useState } from 'react';
import { useImageDrop } from '../../lib/useFlyerDrop';
import { useRecipes } from '../../lib/queries';
import { coverOf, mealPicture, minutesText } from '../../lib/recipes';
import type { Recipe } from '../../lib/types';
import { Loading, Skeleton } from '../ui/Skeleton';
import Problem, { loadProblem } from '../ui/Problem';
import AddRecipe from './AddRecipe';
import RecipeView from './RecipeView';
import s from './Recipes.module.css';

/** The time chips: "fits in" this many minutes (2+ hrs: anything). */
const TIMES: [string, number][] = [
	['15 min', 15],
	['30 min', 30],
	['45 min', 45],
	['1 hr', 60],
	['2+ hrs', Infinity],
];

/**
 * The family's recipe book (docs/recipes.md): each recipe as a card with its picture, narrowed by the time
 * there is, the meal, a protein or a type. A grown-up adds one from pictures or a link (+ Recipe).
 */
export default function RecipesPage({ parent }: { parent: boolean }) {
	const recipesQuery = useRecipes();
	const recipes = recipesQuery.data ?? [];
	const [adding, setAdding] = useState(false);
	// Pictures dropped onto the page (a computer, or a tablet beside Photos): straight into reading.
	const [dropped, setDropped] = useState<File[] | null>(null);
	const takeDrop = useCallback((images: File[]) => {
		setDropped(images.slice(0, 6));
		setAdding(true);
	}, []);
	const notAPicture = useCallback(() => setDropped(null), []);
	const dragging = useImageDrop(parent, takeDrop, notAPicture);
	const [open, setOpen] = useState<string | null>(null);
	// Filters: one chip from each row at most.
	const [time, setTime] = useState<number | null>(null);
	const [tag, setTag] = useState<string | null>(null);
	// The chips worth showing: the meals, proteins and types the book has.
	const tags = [...new Set(recipes.flatMap((r) => [r.meal, ...r.proteins, ...r.types]))].sort();
	const shown = recipes.filter(
		(r) =>
			(time === null || time === Infinity || (r.totalMinutes || Infinity) <= time) &&
			(tag === null || r.meal === tag || r.proteins.includes(tag) || r.types.includes(tag)),
	);
	const opened = recipes.find((r) => r.id === open) ?? null;

	return (
		<section className={s.page} aria-label="Recipes">
			<header className={s.pageHead}>
				<h1 className={s.pageTitle}>Recipes</h1>
				{parent && (
					<button type="button" className={s.add} onClick={() => setAdding(true)}>
						＋ Recipe
					</button>
				)}
			</header>

			{recipes.length > 0 && (
				// Side by side: the time there is, and a kind (a meal, a protein, a type).
				<div className={s.filters}>
					<span className={s.select}>
						<select
							aria-label="Time you have"
							value={time === null ? '' : String(time)}
							onChange={(e) => setTime(e.target.value ? Number(e.target.value) : null)}
						>
							<option value="">Any time</option>
							{TIMES.map(([label, minutes]) => (
								<option key={label} value={String(minutes)}>
									{label === '2+ hrs' ? 'Any length' : `Up to ${label}`}
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
				</div>
			)}

			<div className={s.scroll}>
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
					<p className={s.none}>Nothing fits those. Pick Any time or Any kind to see more.</p>
				) : (
					<ul className={s.grid}>
						{shown.map((r) => (
							<li key={r.id}>
								<RecipeCard recipe={r} onOpen={() => setOpen(r.id)} />
							</li>
						))}
					</ul>
				)}
			</div>

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
			{dragging && (
				<div className={s.drop} aria-live="polite">
					<span className={s.dropBox}>Drop the recipe's pictures</span>
				</div>
			)}
			{opened && <RecipeView recipe={opened} parent={parent} onClose={() => setOpen(null)} />}
		</section>
	);
}

/** "korean" → "Korean". */
const capital = (w: string | null) => (w ? w[0].toUpperCase() + w.slice(1) : null);

/** A recipe in the book: its picture, name, time and kind. */
function RecipeCard({ recipe: r, onOpen }: { recipe: Recipe; onOpen: () => void }) {
	const cover = coverOf(r);
	return (
		<button type="button" className={s.card} onClick={onOpen}>
			{cover ? (
				<img className={s.cardImage} src={cover.thumbUrl} alt="" loading="lazy" />
			) : (
				// No main photo: a picture of its meal.
				<span className={`${s.cardImage} ${s.defaultPicture}`} aria-hidden="true">
					{mealPicture(r.meal)}
				</span>
			)}
			<span className={s.cardText}>
				<span className={s.cardTitle}>{r.title}</span>
				<span className={s.cardMeta}>
					{[r.totalMinutes ? minutesText(r.totalMinutes) : null, capital(r.types[0] ?? r.proteins[0] ?? null)]
						.filter(Boolean)
						.join(' · ')}
				</span>
			</span>
		</button>
	);
}
