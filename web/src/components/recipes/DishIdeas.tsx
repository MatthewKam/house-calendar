import { useState } from 'react';
import { api, problemText } from '../../lib/api';
import { useWeather } from '../../lib/queries';
import { minutesText } from '../../lib/recipes';
import type { DishIdea, SurprisePick, Weather } from '../../lib/types';
import { useTempUnit } from '../../lib/units';
import { sky } from '../../lib/weather';
import Sheet from '../ui/Sheet';
import { Loading, Skeleton } from '../ui/Skeleton';
import Problem from '../ui/Problem';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

const TIMES = ['Up to 30 min', 'Up to 1 hr', 'Over 1 hr'];
/** Kinds to ask for, besides the ones the book has. */
const MORE_KINDS = [
	'soup',
	'pasta',
	'sheet pan',
	'slow cooker',
	'korean',
	'mexican',
	'italian',
	'thai',
	'japanese',
	'indian',
];

/** The weather as this device shows it (home, or here), in words for Surprise me: "Rain, feels like 48°F; …". */
function weatherWords(w: Weather, unit: 'F' | 'C') {
	const d = (n: number) => `${Math.round(n)}°${unit}`;
	return `${sky(w.code, w.isDay).label}, feels like ${d(w.feels)}; high ${d(w.high)}, low ${d(w.low)}; ${w.rainChance}% chance of rain today`;
}

/**
 * Out of ideas: a few dishes to try, picked for the family (their book and ratings, something new mixed in,
 * nobody's allergies), narrowed by time, kind or anything typed. Each one's Search for it opens a web
 * search; a recipe they like goes in the book with ＋ Recipe. More ideas brings a fresh set. Or Surprise
 * me: one dish for today's weather, from their book (to open) or new to them (to search for).
 */
export default function DishIdeas({
	kinds,
	onClose,
	onOpenRecipe,
}: {
	kinds: string[];
	onClose: () => void;
	onOpenRecipe: (id: string) => void;
}) {
	const [time, setTime] = useState('');
	const [kind, setKind] = useState('');
	const [ask, setAsk] = useState('');
	const [ideas, setIdeas] = useState<DishIdea[]>([]);
	const [seen, setSeen] = useState<string[]>([]);
	// Surprise me: the pick, and the ones picked already this time (so Again brings another).
	const [pick, setPick] = useState<SurprisePick | null>(null);
	const [picked, setPicked] = useState<string[]>([]);
	const [busy, setBusy] = useState<'ideas' | 'surprise' | null>(null);
	const [problem, setProblem] = useState<{ text: string; retry: () => void } | null>(null);
	const choices = [...new Set([...kinds, ...MORE_KINDS])].sort();
	const weather = useWeather().data;
	const [unit] = useTempUnit();

	async function surprise() {
		setBusy('surprise');
		setProblem(null);
		try {
			const { pick: next } = await api.surprise({
				time: time || null,
				kind: kind || null,
				ask: ask.trim() || null,
				weather: weather ? weatherWords(weather, unit) : null,
				seen: picked,
			});
			setPick(next);
			setIdeas([]);
			setPicked([...picked, next.name]);
		} catch (err) {
			setProblem({ text: problemText(err, "Couldn't pick one just now."), retry: () => void surprise() });
		} finally {
			setBusy(null);
		}
	}

	async function think(fresh: boolean) {
		setBusy('ideas');
		setProblem(null);
		try {
			const shown = fresh ? [] : seen;
			const { ideas: next } = await api.dishIdeas({
				time: time || null,
				kind: kind || null,
				ask: ask.trim() || null,
				seen: shown,
			});
			setIdeas(next);
			setPick(null);
			setSeen([...shown, ...next.map((i) => i.name)]);
		} catch (err) {
			setProblem({ text: problemText(err, "Couldn't think of any just now."), retry: () => void think(false) });
		} finally {
			setBusy(null);
		}
	}

	return (
		<Sheet label="Dish ideas" onClose={onClose} className={s.ideasView}>
			<header className={sheet.head}>
				<h2 className={sheet.heading}>Dish ideas</h2>
				<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
					×
				</button>
			</header>
			<form
				className={s.ideasAsk}
				onSubmit={(e) => {
					e.preventDefault();
					void think(true);
				}}
			>
				<span className={`${s.select} ${s.ideasPick}`}>
					<select aria-label="Time you have" value={time} onChange={(e) => setTime(e.target.value)}>
						<option value="">Any time</option>
						{TIMES.map((t) => (
							<option key={t} value={t}>
								{t}
							</option>
						))}
					</select>
				</span>
				<span className={`${s.select} ${s.kind} ${s.ideasPick}`}>
					<select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
						<option value="">Any kind</option>
						{choices.map((k) => (
							<option key={k} value={k}>
								{k[0].toUpperCase() + k.slice(1)}
							</option>
						))}
					</select>
				</span>
				<input
					className={s.ideasInput}
					placeholder="Anything else? (something with salmon)"
					aria-label="Anything else"
					value={ask}
					maxLength={200}
					onChange={(e) => setAsk(e.target.value)}
				/>
				<button type="submit" className={sheet.primary} disabled={busy !== null}>
					{ideas.length ? 'New ideas' : 'Show ideas'}
				</button>
			</form>
			{/* Or just one, for the weather. */}
			<div className={s.surpriseRow}>
				<button type="button" className={s.surpriseButton} disabled={busy !== null} onClick={() => void surprise()}>
					🎲 {pick ? 'Again' : 'Surprise me'}
				</button>
				<span className={s.hint}>
					One pick for today
					{weather ? ` (${sky(weather.code, weather.isDay).icon} ${Math.round(weather.feels)}°)` : ''}, from your book
					or something new.
				</span>
			</div>

			{problem && <Problem message={problem.text} onRetry={problem.retry} />}
			{busy === 'surprise' ? (
				<Loading label="Picking one" className={s.ideas}>
					<Skeleton height="9rem" />
				</Loading>
			) : busy === 'ideas' ? (
				<Loading label="Thinking of dishes" className={s.ideas}>
					{Array.from({ length: 6 }, (_, i) => (
						<Skeleton key={i} height="9rem" />
					))}
				</Loading>
			) : pick ? (
				<div className={`${s.idea} ${s.surprisePick}`} role="status">
					<span className={s.ideaEmoji} aria-hidden="true">
						{pick.emoji}
					</span>
					<span className={s.ideaText}>
						<span className={s.surpriseFrom}>{pick.recipeId ? '📖 From your book' : '✨ Something new'}</span>
						<b>{pick.name}</b>
						<span>{pick.about}</span>
						<span className={s.ideaWhy}>
							{[pick.minutes ? `~${minutesText(pick.minutes)}` : null, pick.why].filter(Boolean).join(' · ')}
						</span>
					</span>
					{pick.recipeId ? (
						<button type="button" className={s.ideaSearch} onClick={() => onOpenRecipe(pick.recipeId!)}>
							Open recipe
						</button>
					) : (
						<a
							className={s.ideaSearch}
							href={`https://www.google.com/search?q=${encodeURIComponent(`${pick.name} recipe`)}`}
							target="_blank"
							rel="noreferrer"
						>
							Search for it ↗
						</a>
					)}
				</div>
			) : (
				ideas.length > 0 && (
					<ul className={s.ideas}>
						{ideas.map((i) => (
							<li key={i.name} className={s.idea}>
								<span className={s.ideaEmoji} aria-hidden="true">
									{i.emoji}
								</span>
								<span className={s.ideaText}>
									<b>{i.name}</b>
									<span>{i.about}</span>
									<span className={s.ideaWhy}>
										{[i.minutes ? `~${minutesText(i.minutes)}` : null, i.why].filter(Boolean).join(' · ')}
									</span>
								</span>
								<a
									className={s.ideaSearch}
									href={`https://www.google.com/search?q=${encodeURIComponent(`${i.name} recipe`)}`}
									target="_blank"
									rel="noreferrer"
								>
									Search for it ↗
								</a>
							</li>
						))}
					</ul>
				)
			)}
			{!busy && ideas.length > 0 && (
				<div className={sheet.actions}>
					<p className={s.hint}>Found one you like? Add it with ＋ Recipe (its link or a screenshot).</p>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={() => void think(false)}>
						More ideas
					</button>
				</div>
			)}
		</Sheet>
	);
}
