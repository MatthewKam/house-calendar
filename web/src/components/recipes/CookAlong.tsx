import { useEffect, useState } from 'react';
import type { CookProgress, CookTimer } from '../../../../shared/cook.ts';
import { cookBase, cookId, keepName, keptName, untilWords } from '../../lib/cook';
import { SERVER } from '../../lib/native';
import { ingredientLine } from '../../lib/recipes';
import { useCookTogether } from '../../lib/queries';
import { useWakeLock } from '../../lib/useWakeLock';
import { problemText } from '../../lib/api';
import Problem from '../ui/Problem';
import { Loading, Skeleton, SkeletonLines } from '../ui/Skeleton';
import CookingBar from './CookingBar';
import { CookingWith, DoneBy } from './CookingWith';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

/** Ticked off, or back on. */
const toggle = (list: number[], n: number) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n]);

/**
 * A Cooking together link's page (/cook/<household>/<secret>, main.tsx): anyone with the link, signed
 * in or not, cooks the recipe along with whoever sent it. A name first (kept on the device), then the
 * recipe with their own prep ticks, steps and timers, and everyone else's progress beside them. Coming
 * back to the link (a reload, the next day) carries on where they were.
 */
export default function CookAlong({ household, secret }: { household: string; secret: string }) {
	const base = cookBase(household, secret);
	const [name, setName] = useState(keptName());
	const [progress, setProgress] = useState<CookProgress | null>(null);
	const along = useCookTogether(base, progress && { name, progress });
	const mine = cookId();
	useWakeLock(true);

	// Back again: where this device had got to.
	useEffect(() => {
		if (progress || !along.data) return;
		const was = along.data.people.find((p) => p.cookId === mine);
		if (was?.progress.startedAt) setProgress(was.progress);
	}, [along.data, progress, mine]);

	if (along.isPending)
		return (
			<main className={s.along}>
				<Loading label="Opening the recipe">
					<Skeleton height="12rem" />
					<SkeletonLines count={6} />
				</Loading>
			</main>
		);
	if (along.isError || !along.data)
		return (
			<main className={s.along}>
				<img src="/wordmark.svg" alt="Sprig" className={s.alongMark} />
				<Problem
					kind="page"
					message={problemText(along.error, 'This cooking link has ended. Ask for a new one.')}
					onRetry={() => void along.refetch()}
				/>
			</main>
		);

	const { recipe, until } = along.data;
	const others = along.data.people.filter((p) => p.cookId !== mine);
	const picture = (url: string) => `${SERVER}${base}/${url}`;
	const set = (change: Partial<CookProgress>) => setProgress((p) => p && { ...p, ...change });

	// Who's cooking: a name, then in.
	if (!progress)
		return (
			<main className={s.along}>
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
					<input
						id="cook-name"
						value={name}
						maxLength={40}
						autoComplete="given-name"
						placeholder="Grandma"
						onChange={(e) => setName(e.target.value)}
					/>
					<button type="submit" className={sheet.primary} disabled={!name.trim()}>
						Start cooking
					</button>
				</form>
			</main>
		);

	const groups = [...new Set(recipe.ingredients.map((i) => i.group))];
	return (
		<main className={s.along}>
			<header className={s.alongHead}>
				<img src="/wordmark.svg" alt="Sprig" className={s.alongMark} />
				<span className={s.hint}>
					Cooking as {name} · until {untilWords(until)}
				</span>
			</header>
			<h1 className={s.alongTitle}>{recipe.title}</h1>
			{progress.doneAt ? (
				<p className={s.said} role="status">
					🎉 Done! The others can see you’ve finished.{' '}
					<button type="button" className={s.textLink} onClick={() => set({ doneAt: null })}>
						Keep cooking
					</button>
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

			{recipe.ingredients.length > 0 && (
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
												<DoneBy others={others} done={(p) => p.progress.prepped.includes(n)} />
											</label>
										</li>
									),
								)}
							</ul>
						</div>
					))}
				</section>
			)}

			{recipe.steps.length > 0 && (
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
									<DoneBy others={others} done={(p) => p.progress.steps.includes(n)} />
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
			)}
			{recipe.notes && <p className={s.hint}>{recipe.notes}</p>}
		</main>
	);
}
