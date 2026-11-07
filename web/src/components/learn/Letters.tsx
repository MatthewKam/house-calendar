import { useEffect, useMemo, useState } from "react";
import { Pic } from "./art";
import { Board, Hear, Next } from "./parts";
import { LOOK_ALIKE, WORDS } from "./things";
import { at, pick, shuffle, useRounds, type GameProps } from "./rounds";
import { say } from "./sound";
import s from "../../styles/Learn.module.css";

/** Letters to choose from, the longest word, whether look-alike letters are offered, and capitals, by level. */
const CHOICES = [2, 3, 3, 3, 4, 4];
const LONGEST = [3, 3, 4, 4, 5, 8];
const LOOK_ALIKES = [false, false, true, true, true, true];
const CAPITALS = [true, true, true, false, false, false];
const ROUNDS = 4;
const ABC = "abcdefghijklmnopqrstuvwxyz";

/**
 * The missing first letter (age 4): a picture and its word with the first letter gone ("_at"), said
 * aloud (tap the picture to hear it again). Tap the letter that goes in the gap. Short words and very different letters first; then
 * look-alikes (b, d, p), small letters, and longer words.
 */
export default function Letters({ level, onDone, onBack }: GameProps) {
	const rounds = useRounds(ROUNDS, onDone);
	const caps = at(CAPITALS, level);
	const plan = useMemo(() => {
		const longest = at(LONGEST, level);
		// Long words at the top levels, with a short one now and then.
		const words = WORDS.filter((w) => w.word.length <= longest && (longest < 5 || w.word.length >= 4));
		return pick(words, ROUNDS).map((w) => {
			const first = w.word[0];
			const alike = at(LOOK_ALIKES, level) ? (LOOK_ALIKE[first] ?? []) : [];
			const others = shuffle([...ABC].filter((l) => l !== first && !alike.includes(l)));
			const wrong = [...alike, ...others].slice(0, at(CHOICES, level) - 1);
			return { ...w, first, choices: shuffle([first, ...wrong]) };
		});
	}, [level]);
	const r = plan[rounds.round];
	const [tapped, setTapped] = useState<{ letter: string; n: number } | null>(null);
	const show = (text: string) => (caps ? text.toUpperCase() : text);

	const hear = () => say(r.word);
	useEffect(() => {
		setTapped(null);
		const t = setTimeout(() => say(r.word), 400);
		return () => clearTimeout(t);
	}, [r]);

	function choose(letter: string) {
		if (rounds.got) return;
		setTapped((t) => ({ letter, n: (t?.n ?? 0) + 1 }));
		if (letter === r.first) say(`Yes! ${letter.toUpperCase()}. ${r.word}!`);
		else say(letter.toUpperCase());
		rounds.tap(letter === r.first);
	}

	return (
		<Board onBack={onBack} total={ROUNDS} done={rounds.round + (rounds.got ? 1 : 0)}>
			<div className={s.wordCard}>
				<button type="button" className={s.wordPic} onClick={hear} aria-label={`Hear the word: ${r.word}`}>
					<Pic id={r.pic} />
				</button>
				<div className={s.word} aria-label={rounds.got ? r.word : `blank, then ${r.word.slice(1)}`}>
					<span className={`${s.gap} ${rounds.got ? `${s.gapFilled} ${s.pop}` : ""}`}>{rounds.got ? show(r.first) : ""}</span>
					{show(r.word.slice(1))}
				</div>
				<Hear onTap={hear} label="Hear the word" />
			</div>
			<div className={s.choices}>
				{r.choices.map((l) => (
					<button key={`${l}-${tapped?.letter === l ? tapped.n : 0}`} type="button"
						className={`${s.choice} ${s.letter} ${rounds.got && l === r.first ? s.choiceRight : tapped?.letter === l && l !== r.first ? s.wiggle : ""}`}
						onClick={() => choose(l)}>
						{show(l)}
					</button>
				))}
			</div>
			<Next show={rounds.got} onNext={rounds.next} last={rounds.round + 1 >= ROUNDS} />
		</Board>
	);
}
