import { useEffect, useRef, useState } from 'react';
import { api, problemText, type RecipeImage } from '../../lib/api';
import { useRecipeActions, useRecipeReading } from '../../lib/queries';
import { fromBase64, toJpeg } from '../../lib/recipes';
import type { Recipe, RecipeDraft, RecipeFields } from '../../lib/types';
import Sheet from '../ui/Sheet';
import { Loading, Skeleton, SkeletonLines } from '../ui/Skeleton';
import Problem from '../ui/Problem';
import RecipeForm from './RecipeForm';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

/** A recipe from nothing, to type in. */
const BLANK: RecipeFields = {
	title: '',
	servings: null,
	totalMinutes: null,
	activeMinutes: null,
	ingredients: [],
	steps: [],
	notes: null,
	prepAhead: [],
	proteins: [],
	vegetables: [],
	types: [],
	meal: 'dinner',
	sourceUrl: null,
};

type Step =
	| { kind: 'source' }
	| { kind: 'reading' }
	| { kind: 'check'; recipe: RecipeFields; pictures: RecipeImage[]; cover: RecipeImage | null };

/**
 * Adding a recipe: pick pictures (screenshots, a cookbook page; a recipe over several in order) or paste a
 * link, and Claude reads it into a draft (server/recipes.ts). The dish's own photo is cut out as the cover.
 * Then it's checked and fixed before it's kept: nothing is saved until Save recipe. Without Claude on the
 * server, it's typed in (with the pictures kept).
 */
export default function AddRecipe({
	dropped,
	onClose,
	onAdded,
}: {
	/** Pictures dropped onto the page: read straight away. */
	dropped?: File[] | null;
	onClose: () => void;
	onAdded: (r: Recipe) => void;
}) {
	const reading = useRecipeReading().data;
	const { add } = useRecipeActions();
	const [step, setStep] = useState<Step>({ kind: 'source' });
	const [link, setLink] = useState('');
	const [problem, setProblem] = useState<string | null>(null);
	const pick = useRef<HTMLInputElement>(null);

	/** Pictures (shrunk to JPEG first, so they're quick to send) into a draft. */
	async function readPictures(files: File[]) {
		setProblem(null);
		setStep({ kind: 'reading' });
		try {
			const pictures = await Promise.all(files.map((f) => toJpeg(f)));
			if (!reading?.on) return setStep({ kind: 'check', recipe: BLANK, pictures, cover: null });
			const draft = await api.readRecipe({ images: pictures });
			setStep({ kind: 'check', recipe: draft.recipe, pictures, cover: await cutCover(draft, pictures) });
		} catch (err) {
			setProblem(problemText(err, "Couldn't read those pictures."));
			setStep({ kind: 'source' });
		}
	}

	// Dropped pictures: read them once it's known whether Claude can (each drop once).
	const handled = useRef<File[] | null>(null);
	useEffect(() => {
		if (!dropped?.length || !reading || handled.current === dropped) return;
		handled.current = dropped;
		void readPictures(dropped);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dropped, reading]);

	async function readLink() {
		setProblem(null);
		setStep({ kind: 'reading' });
		try {
			const draft = await api.readRecipe({ url: link.trim() });
			// The page's own photo of the dish, as a JPEG like the rest.
			const cover = draft.image ? await toJpeg(fromBase64(draft.image)).catch(() => null) : null;
			setStep({ kind: 'check', recipe: draft.recipe, pictures: [], cover });
		} catch (err) {
			setProblem(problemText(err, "Couldn't read that link."));
			setStep({ kind: 'source' });
		}
	}

	if (step.kind === 'check') {
		const all = [...step.pictures, ...(step.cover ? [step.cover] : [])];
		return (
			<Sheet label="Check the recipe" onClose={onClose}>
				<RecipeForm
					title={step.recipe.title ? 'Check the recipe' : 'New recipe'}
					initial={step.recipe}
					saving={add.isPending}
					onCancel={onClose}
					above={
						all.length > 0 && (
							<div className={s.pictures}>
								{all.map((p, i) => (
									<img
										key={i}
										src={`data:${p.mediaType};base64,${p.data}`}
										alt=""
										className={step.cover === p ? s.coverPick : undefined}
									/>
								))}
							</div>
						)
					}
					onSave={(recipe) =>
						add.mutate(
							// The cut-out cover goes last, and is the one shown on the card.
							{ recipe, images: all, cover: step.cover ? all.length - 1 : null },
							{
								onSuccess: (saved) => {
									onClose();
									onAdded(saved);
								},
							},
						)
					}
				/>
			</Sheet>
		);
	}

	return (
		<Sheet label="Add a recipe" onClose={onClose}>
			<header className={sheet.head}>
				<h2 className={sheet.heading}>Add a recipe</h2>
				<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
					×
				</button>
			</header>
			{step.kind === 'reading' ? (
				<Loading label="Reading the recipe">
					<p className={s.hint}>Reading the recipe…</p>
					<Skeleton height="10rem" />
					<SkeletonLines count={5} />
				</Loading>
			) : (
				<div className={s.sources}>
					{problem && <Problem message={problem} />}
					<button type="button" className={s.source} onClick={() => pick.current?.click()}>
						<span aria-hidden="true">📸</span>
						<span>
							<b>From pictures</b>
							<span className={s.hint}>
								Screenshots or a photo of a cookbook page. Pick them in order if it runs over a few.
							</span>
						</span>
					</button>
					<input
						ref={pick}
						type="file"
						accept="image/*"
						multiple
						hidden
						onChange={(e) => {
							const files = [...(e.target.files ?? [])].slice(0, 6);
							e.target.value = '';
							if (files.length) void readPictures(files);
						}}
					/>
					{reading?.on && (
						<form
							className={s.linkRow}
							onSubmit={(e) => {
								e.preventDefault();
								if (link.trim()) void readLink();
							}}
						>
							<input
								type="url"
								inputMode="url"
								placeholder="Or paste a recipe link"
								aria-label="Recipe link"
								value={link}
								onChange={(e) => setLink(e.target.value)}
							/>
							<button type="submit" className={sheet.primary} disabled={!link.trim()}>
								Read
							</button>
						</form>
					)}
					<button
						type="button"
						className={s.textLink}
						onClick={() => setStep({ kind: 'check', recipe: BLANK, pictures: [], cover: null })}
					>
						Or type it in
					</button>
					{reading && !reading.on && (
						<p className={s.hint}>
							Reading pictures and links needs Claude on the server (ANTHROPIC_API_KEY); for now they're kept as they
							are.
						</p>
					)}
				</div>
			)}
		</Sheet>
	);
}

/** The dish's photo inside a picture, cut out for the cover (when Claude found one). */
async function cutCover(draft: RecipeDraft, pictures: RecipeImage[]) {
	const box = draft.cover;
	const from = box && pictures[box.image];
	if (!box || !from || box.width < 0.05 || box.height < 0.05) return null;
	const clamp = (n: number) => Math.min(1, Math.max(0, n));
	return toJpeg(fromBase64(from), {
		x: clamp(box.x),
		y: clamp(box.y),
		width: Math.min(box.width, 1 - clamp(box.x)),
		height: Math.min(box.height, 1 - clamp(box.y)),
	}).catch(() => null);
}
