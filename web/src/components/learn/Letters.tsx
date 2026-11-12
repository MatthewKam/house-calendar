import { useEffect, useMemo, useState } from 'react';
import { Pic } from './art';
import { Board } from './parts';
import { LOOK_ALIKE, WORDS } from './things';
import { at, fresh, shuffle, useRounds, type GameProps } from './rounds';
import s from './Learn.module.css';
import g from './LearnLetters.module.css';

/** Letters to choose from, whether look-alike letters are offered, and capitals, by level. */
const CHOICES = [2, 3, 3, 3, 4, 4];
const LOOK_ALIKES = [false, false, true, true, true, true];
const CAPITALS = [true, true, true, false, false, false];
const ROUNDS = 4;
const ABC = 'abcdefghijklmnopqrstuvwxyz';

/**
 * The missing first letter (age 4): a picture and its word with the first letter gone ("_at"). Tap the
 * letter that goes in the gap. Words a 4-year-old knows, a new few each play; very different letters
 * to choose from first, then more, look-alikes (b, d, p), and small letters.
 */
export default function Letters({ level, onDone, onBack }: GameProps) {
	const rounds = useRounds(ROUNDS, onDone);
	const caps = at(CAPITALS, level);
	const plan = useMemo(() => {
		// Any words, none seen recently; the level's in the letters to choose from.
		return fresh('letters.words', WORDS, ROUNDS, (w) => w.word).map((w) => {
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

	useEffect(() => setTapped(null), [r]);

	function choose(letter: string) {
		if (rounds.got) return;
		setTapped((t) => ({ letter, n: (t?.n ?? 0) + 1 }));
		rounds.tap(letter === r.first);
	}

	return (
		<Board onBack={onBack} total={ROUNDS} done={rounds.round + (rounds.got ? 1 : 0)} cheer={rounds.got}>
			{(box) => {
				const wide = box.w > box.h * 1.2;
				const key = Math.floor(
					Math.min(110, (box.w - 24 * r.choices.length) / r.choices.length, box.h * (wide ? 0.3 : 0.2)),
				);
				const pic = Math.floor(Math.min(320, wide ? box.h - key - 80 : box.h * 0.4, box.w * (wide ? 0.4 : 0.7)));
				// The word as big as fits beside (or under) the picture.
				const letters = r.word.length;
				const font = Math.floor(
					Math.min(120, (wide ? box.w - pic - 60 : box.w - 40) / (letters * 0.75 + 0.6), pic * 0.5),
				);
				return (
					<div className={s.column}>
						<div className={wide ? g.rowTight : g.columnTight}>
							<span className={g.wordPic} style={{ width: pic, height: pic }}>
								<Pic id={r.pic} label={r.word} />
							</span>
							<div
								className={g.word}
								style={{ fontSize: font }}
								aria-label={rounds.got ? r.word : `blank, then ${r.word.slice(1)}`}
							>
								<span className={`${g.gap} ${rounds.got ? `${g.gapFilled} ${s.pop}` : ''}`}>
									{rounds.got ? show(r.first) : ''}
								</span>
								{show(r.word.slice(1))}
							</div>
						</div>
						<div className={s.choices}>
							{r.choices.map((l) => (
								<button
									key={`${l}-${tapped?.letter === l ? tapped.n : 0}`}
									type="button"
									className={`${s.choice} ${rounds.got && l === r.first ? s.choiceRight : tapped?.letter === l && l !== r.first ? s.wiggle : ''}`}
									style={{ width: key, height: key, fontSize: key * 0.55 }}
									onClick={() => choose(l)}
								>
									{show(l)}
								</button>
							))}
						</div>
					</div>
				);
			}}
		</Board>
	);
}
