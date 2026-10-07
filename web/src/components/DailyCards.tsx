import { useState } from "react";
import { useDaily } from "../lib/queries";
import s from "../styles/DailyCards.module.css";

/**
 * Two small cards beside the weather: a dad joke (tap for the answer) and a quote. Each comes once a
 * day; a card that couldn't be fetched just isn't shown.
 */
export default function DailyCards({ today }: { today: string }) {
	const daily = useDaily(today).data;
	const [revealed, setRevealed] = useState<string | null>(null);
	if (!daily) return null;
	const { joke, quote } = daily;
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
						<button className={s.jokeBody} onClick={() => setRevealed(showAnswer ? null : joke.text)} aria-expanded={showAnswer}>
							<span className={s.setup}>{split[1]}</span>
							<span className={showAnswer ? s.answer : s.tapHint}>{showAnswer ? split[2] : "Tap for the answer"}</span>
						</button>
					) : (
						<p className={s.setup}>{joke.text}</p>
					)}
				</section>
			)}
			{quote && (
				<section className={`${s.card} ${s.quote}`} aria-label="Quote of the day">
					<h3 className={s.label}>
						<span aria-hidden="true">💬</span> Quote of the day
					</h3>
					<blockquote className={s.quoteText}>“{quote.text}”</blockquote>
					<div className={s.author}>— {quote.author}</div>
					{/* ZenQuotes asks for credit. */}
					<a className={s.credit} href="https://zenquotes.io/" target="_blank" rel="noreferrer">
						Quotes from ZenQuotes
					</a>
				</section>
			)}
		</>
	);
}
