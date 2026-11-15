import { useState } from 'react';
import { pickOfTheDay, useDailyThemes, WALL } from '../../lib/dailyThemes';
import { useDaily } from '../../lib/queries';
import { QUOTE_THEMES } from '../../lib/quotes';
import { Loading, SkeletonLines } from '../ui/Skeleton';
import ThemedHead from '../ui/ThemedHead';
import s from './DailyCards.module.css';

/**
 * Two small cards beside the weather: a dad joke (tap for the answer) and a quote. The joke comes once a
 * day from the server, and isn't shown when it couldn't be fetched; the quote is the day's from the
 * family's themes for the wall (Settings, Daily cards).
 */
export default function DailyCards({ today }: { today: string }) {
	const dailyQuery = useDaily(today);
	const joke = dailyQuery.data?.joke;
	const themes = useDailyThemes(QUOTE_THEMES, 'quote', WALL);
	const quote = pickOfTheDay(themes.on, today);
	const [revealed, setRevealed] = useState<string | null>(null);
	if (dailyQuery.isPending || !themes.ready) {
		return (
			<>
				<Loading label="Loading the dad joke" className={s.card}>
					<SkeletonLines count={2} />
				</Loading>
				<Loading label="Loading the quote" className={s.card}>
					<SkeletonLines count={3} />
				</Loading>
			</>
		);
	}
	// "Question? Answer": the answer waits for a tap.
	const split = joke && /^(.*?\?)\s+(.+)$/s.exec(joke.text);
	const showAnswer = revealed === joke?.text;

	return (
		<>
			{joke && (
				<section className={`${s.card} ${s.joke}`} aria-label="Dad joke of the day">
					<h3 className={s.label}>
						<span aria-hidden="true">😄</span> Dad joke of the day
					</h3>
					{split ? (
						<button
							className={s.jokeBody}
							onClick={() => setRevealed(showAnswer ? null : joke.text)}
							aria-expanded={showAnswer}
						>
							<span className={s.setup}>{split[1]}</span>
							<span className={showAnswer ? s.answer : s.tapHint}>{showAnswer ? split[2] : 'Tap for the answer'}</span>
						</button>
					) : (
						<p className={s.setup}>{joke.text}</p>
					)}
				</section>
			)}
			<section className={`${s.card} ${s.quote}`} aria-label="Quote of the day">
				<ThemedHead themes={themes.on} of={QUOTE_THEMES.length}>
					<h3 className={s.label}>
						<span aria-hidden="true">💬</span> Quote of the day
					</h3>
				</ThemedHead>
				<blockquote className={s.quoteText}>“{quote.item.text}”</blockquote>
				<div className={s.author}>— {quote.item.by}</div>
			</section>
		</>
	);
}
