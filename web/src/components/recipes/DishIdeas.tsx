import { useState } from 'react';
import { api, problemText } from '../../lib/api';
import { minutesText } from '../../lib/recipes';
import type { DishIdea } from '../../lib/types';
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

/**
 * Out of ideas: a few dishes to try, picked for the family (their book and ratings, something new mixed in,
 * nobody's allergies), narrowed by time, kind or anything typed. Each one's Search for it opens a web
 * search; a recipe they like goes in the book with ＋ Recipe. More ideas brings a fresh set.
 */
export default function DishIdeas({ kinds, onClose }: { kinds: string[]; onClose: () => void }) {
	const [time, setTime] = useState('');
	const [kind, setKind] = useState('');
	const [ask, setAsk] = useState('');
	const [ideas, setIdeas] = useState<DishIdea[]>([]);
	const [seen, setSeen] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const choices = [...new Set([...kinds, ...MORE_KINDS])].sort();

	async function think(fresh: boolean) {
		setBusy(true);
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
			setSeen([...shown, ...next.map((i) => i.name)]);
		} catch (err) {
			setProblem(problemText(err, "Couldn't think of any just now."));
		} finally {
			setBusy(false);
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
				<button type="submit" className={sheet.primary} disabled={busy}>
					{ideas.length ? 'New ideas' : 'Show ideas'}
				</button>
			</form>

			{problem && <Problem message={problem} onRetry={() => void think(false)} />}
			{busy ? (
				<Loading label="Thinking of dishes" className={s.ideas}>
					{Array.from({ length: 6 }, (_, i) => (
						<Skeleton key={i} height="9rem" />
					))}
				</Loading>
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
