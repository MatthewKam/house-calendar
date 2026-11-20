import { useEffect, useState, type ReactNode } from 'react';
import type { CookProgress, CookTimer } from '../../../../shared/cook.ts';
import { cookBase, cookId, keepName, keptName, untilWords } from '../../lib/cook';
import { SERVER } from '../../lib/native';
import { ingredientLine, mealPicture, minutesText } from '../../lib/recipes';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from '../../lib/useMediaQuery';
import { useCookTogether } from '../../lib/queries';
import { useWakeLock } from '../../lib/useWakeLock';
import { problemText } from '../../lib/api';
import Problem from '../ui/Problem';
import { Loading, Skeleton, SkeletonLines } from '../ui/Skeleton';
import CookingBar from './CookingBar';
import { CookingWith, DoneBy } from './CookingWith';
import s from './Recipes.module.css';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { Input } from '../ui/Field';

/** Ticked off, or back on. */
const toggle = (list: number[], n: number) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n]);

/** The page: its own scrolling column (the app's page doesn't scroll), as wide as a recipe opened in the app. */
function Page({ children }: { children: ReactNode }) {
	return (
		<div className={s.alongPage}>
			<main className={`${s.view} ${s.along}`}>{children}</main>
		</div>
	);
}

/**
 * A Cooking together link's page (/cook/<household>/<secret>, main.tsx): anyone with the link, signed
 * in or not, cooks the recipe along with whoever sent it. A name first (kept on the device), then the
 * recipe with their own prep ticks, steps and timers, and everyone else's progress beside them, laid
 * out as the recipe is in the app (photo beside what to know; ingredients and steps side by side, or
 * tabs on a phone). Coming back to the link (a reload, the next day) carries on where they were.
 */
export default function CookAlong({ household, secret }: { household: string; secret: string }) {
	const base = cookBase(household, secret);
	const [name, setName] = useState(keptName());
	const [progress, setProgress] = useState<CookProgress | null>(null);
	const along = useCookTogether(base, progress && { name, progress });
	const mine = cookId();
	useWakeLock(true);
	const upright = useMediaQuery(PHONE);
	const sideways = useMediaQuery(PHONE_SIDEWAYS);
	const phone = upright || sideways;
	const [tab, setTab] = useState<'ingredients' | 'steps'>('ingredients');

	// Back again: where this device had got to.
	useEffect(() => {
		if (progress || !along.data) return;
		const was = along.data.people.find((p) => p.cookId === mine);
		if (was?.progress.startedAt) setProgress(was.progress);
	}, [along.data, progress, mine]);

	if (along.isPending)
		return (
			<Page>
				<Loading label="Opening the recipe">
					<Skeleton height="12rem" />
					<SkeletonLines count={6} />
				</Loading>
			</Page>
		);
	if (along.isError || !along.data)
		return (
			<Page>
				<img src="/wordmark.svg" alt="Sprig" className={s.alongMark} />
				<Problem
					kind="page"
					message={problemText(along.error, 'This cooking link has ended. Ask for a new one.')}
					onRetry={() => void along.refetch()}
				/>
			</Page>
		);

	const { recipe, until } = along.data;
	const others = along.data.people.filter((p) => p.cookId !== mine);
	// Everyone for the dots, this cook as they are here (not as last saved).
	const everyone = along.data.people.map((p) => (p.cookId === mine && progress ? { ...p, progress } : p));
	const picture = (url: string) => `${SERVER}${base}/${url}`;
	const set = (change: Partial<CookProgress>) => setProgress((p) => p && { ...p, ...change });

	// Who's cooking: a name, then in.
	if (!progress)
		return (
			<Page>
				<img src="/wordmark.svg" alt="Sprig" className={s.alongMark} />
				{recipe.coverUrl && <img src={picture(recipe.coverUrl)} alt="" className={s.alongCover} />}
				<h1 className={s.alongTitle}>Cook {recipe.title} together</h1>
				{others.length > 0 && (
					<p className={s.hint}>
						With {others.map((p) => p.name).join(', ')}. You each tick your own; you’ll see each other’s.
					</p>
				)}
				<form
					className={s.alongName}
					onSubmit={(e) => {
						e.preventDefault();
						const n = name.trim();
						if (!n) return;
						keepName(n);
						setName(n);
						setProgress({ startedAt: Date.now(), prepped: [], steps: [], timers: [], doneAt: null });
					}}
				>
					<label htmlFor="cook-name">Your name</label>
					<Input
						id="cook-name"
						value={name}
						maxLength={40}
						autoComplete="given-name"
						placeholder="Grandma"
						onChange={(e) => setName(e.target.value)}
					/>
					<Button variant="primary" type="submit" disabled={!name.trim()}>
						Start cooking
					</Button>
				</form>
			</Page>
		);

	const groups = [...new Set(recipe.ingredients.map((i) => i.group))];
	const ingredients = recipe.ingredients.length > 0 && (
		<section className={s.part} aria-label="Ingredients">
			<h2 className={s.sectionHead}>Prep and gather</h2>
			<p className={s.hint}>Tick each one once it’s prepped or out.</p>
			{groups.map((g) => (
				<div key={g ?? ''} className={s.group}>
					{g && <h3>{g}</h3>}
					<ul className={s.checklist}>
						{recipe.ingredients.map((i, n) =>
							i.group !== g ? null : (
								<li key={n}>
									<label className={s.check}>
										<input
											type="checkbox"
											checked={progress.prepped.includes(n)}
											onChange={() => set({ prepped: toggle(progress.prepped, n) })}
										/>
										<span>{ingredientLine(i)}</span>
										<DoneBy people={everyone} done={(p) => p.progress.prepped.includes(n)} />
									</label>
								</li>
							),
						)}
					</ul>
				</div>
			))}
		</section>
	);
	const steps = recipe.steps.length > 0 && (
		<section className={s.part} aria-label="Steps">
			<h2 className={s.sectionHead}>Steps</h2>
			<ol className={s.steps}>
				{recipe.steps.map((step, n) => (
					<li key={n}>
						<button
							type="button"
							className={s.step}
							aria-pressed={progress.steps.includes(n)}
							onClick={() => set({ steps: toggle(progress.steps, n) })}
						>
							<span className={s.stepNumber}>{n + 1}</span>
							{step}
							<DoneBy people={everyone} done={(p) => p.progress.steps.includes(n)} />
						</button>
						{recipe.images.some((i) => i.step === n) && (
							<div className={s.stepPhotos}>
								{recipe.images
									.filter((i) => i.step === n)
									.map((i) => (
										<img key={i.url} src={picture(i.url)} alt="" loading="lazy" />
									))}
							</div>
						)}
					</li>
				))}
			</ol>
		</section>
	);
	return (
		<Page>
			<header className={s.alongHead}>
				<img src="/wordmark.svg" alt="Sprig" className={s.alongMark} />
				<span className={s.hint}>
					Cooking as {name} · until {untilWords(until)}
				</span>
			</header>
			<h1 className={s.alongTitle}>{recipe.title}</h1>

			{/* The top, as in the app: its photo, and what to know with the clock and the others. */}
			<div className={s.top}>
				{recipe.coverUrl ? (
					<img className={s.cover} src={picture(recipe.coverUrl)} alt="" />
				) : (
					<span className={`${s.cover} ${s.defaultPicture}`} aria-hidden="true">
						{mealPicture(recipe.meal)}
					</span>
				)}
				<div className={s.about}>
					{(!!recipe.totalMinutes || recipe.servings !== null) && (
						<div className={s.meta}>
							{!!recipe.totalMinutes && <span>⏱ {minutesText(recipe.totalMinutes)}</span>}
							{!!recipe.activeMinutes && recipe.activeMinutes !== recipe.totalMinutes && (
								<span>{minutesText(recipe.activeMinutes)} hands-on</span>
							)}
							{recipe.servings !== null && <span>Serves {recipe.servings}</span>}
						</div>
					)}
					{progress.doneAt ? (
						<p className={s.said} role="status">
							🎉 Done! The others can see you’ve finished.{' '}
							<Button variant="link" size="sm" className={s.textLink} onClick={() => set({ doneAt: null })}>
								Keep cooking
							</Button>
						</p>
					) : (
						<CookingBar
							startedAt={progress.startedAt ?? Date.now()}
							timers={progress.timers}
							onTimers={(timers: CookTimer[]) => set({ timers })}
							onDone={() => set({ doneAt: Date.now() })}
							doneLabel="I'm done"
						/>
					)}
					<CookingWith others={others} steps={recipe.steps.length} ingredients={recipe.ingredients.length} />
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
			{recipe.notes && <p className={s.hint}>{recipe.notes}</p>}
		</Page>
	);
}
