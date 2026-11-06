import { useMemo, useState, type CSSProperties } from "react";
import { Dots, Next } from "./parts";
import { pick, shuffle, useRounds, type ActivityProps } from "./rounds";
import s from "../../styles/Learn.module.css";

/** Letters with their sound and three things that start with it. */
const LETTERS = [
	{ letter: "B", sound: "b-b-b", words: [["Ball", "⚽"], ["Bear", "🐻"], ["Banana", "🍌"]] },
	{ letter: "S", sound: "sss", words: [["Sun", "☀️"], ["Sock", "🧦"], ["Snake", "🐍"]] },
	{ letter: "D", sound: "d-d-d", words: [["Dog", "🐶"], ["Duck", "🦆"], ["Drum", "🥁"]] },
	{ letter: "M", sound: "mmm", words: [["Moon", "🌙"], ["Milk", "🥛"], ["Monkey", "🐵"]] },
	{ letter: "F", sound: "fff", words: [["Fish", "🐟"], ["Frog", "🐸"], ["Fox", "🦊"]] },
	{ letter: "P", sound: "p-p-p", words: [["Pig", "🐷"], ["Pizza", "🍕"], ["Penguin", "🐧"]] },
	{ letter: "T", sound: "t-t-t", words: [["Tiger", "🐯"], ["Train", "🚂"], ["Tree", "🌳"]] },
	{ letter: "C", sound: "k-k-k", words: [["Cat", "🐱"], ["Car", "🚗"], ["Cake", "🎂"]] },
] as const;
type Word = { word: string; picture: string; letter: string };
const ALL: Word[] = LETTERS.flatMap((l) => l.words.map(([word, picture]) => ({ word, picture, letter: l.letter })));
/** Letters that look or sound alike, so level 2's choices make them think. */
const LOOK_ALIKE: Record<string, string[]> = { B: ["D", "P"], D: ["B", "P"], P: ["B", "D"], M: ["N", "W"], C: ["K", "G"], S: ["Z", "C"], F: ["E", "T"], T: ["F", "L"] };
const SOUND: Record<string, string> = Object.fromEntries(LETTERS.map((l) => [l.letter, l.sound]));

/**
 * Letters. Level 1: the letter of the day and its sound; find the three things that start with it.
 * Level 2: a picture with no word under it; pick the letter it starts with (look-alikes included).
 */
export default function Letters({ level, onDone }: ActivityProps) {
	return level >= 2 ? <WhichLetter onDone={onDone} /> : <FindThem onDone={onDone} />;
}

function FindThem({ onDone }: { onDone: ActivityProps["onDone"] }) {
	const { today, cards } = useMemo(() => {
		const today = LETTERS[Math.floor(Math.random() * LETTERS.length)];
		const others = pick(ALL.filter((w) => w.letter !== today.letter), 3);
		return { today, cards: shuffle([...today.words.map(([word, picture]) => ({ word, picture, letter: today.letter })), ...others]) };
	}, []);
	const [found, setFound] = useState<string[]>([]);
	const [last, setLast] = useState<{ word: string; n: number } | null>(null);
	const [misses, setMisses] = useState(0);
	const done = found.length === 3;
	const tapped = last && cards.find((c) => c.word === last.word);
	return (
		<div className={s.board}>
			<div className={s.top}>
				<span className={s.letter}>{today.letter}{today.letter.toLowerCase()}</span>
				<Dots total={3} done={found.length} />
			</div>
			<p className={s.prompt}>
				{done ? `You found them all! They start with ${today.letter}.`
					: !tapped ? `${today.letter} says ${today.sound}. Which ones start with ${today.letter}?`
					: tapped.letter === today.letter ? `Yes! ${today.sound}-${tapped.word.toLowerCase()}!`
					: `${tapped.word} starts with ${tapped.letter}. Find a ${today.letter}!`}
			</p>
			<div className={s.tiles} style={{ "--cols": 3 } as CSSProperties}>
				{cards.map((c) => {
					const hit = found.includes(c.word);
					const isLast = last?.word === c.word;
					return (
						<button key={`${c.word}-${isLast ? last.n : 0}`} type="button" aria-label={c.word}
							className={`${s.tile} ${hit ? s.tileRight : ""} ${isLast ? (c.letter === today.letter ? s.yes : s.nope) : ""}`}
							onClick={() => {
								if (hit || done) return;
								setLast({ word: c.word, n: (last?.n ?? 0) + 1 });
								if (c.letter === today.letter) setFound([...found, c.word]);
								else setMisses(misses + 1);
							}}>
							<span className={s.tilePicture} aria-hidden="true">{c.picture}</span>
							<span>{hit || isLast ? c.word : ""}</span>
						</button>
					);
				})}
			</div>
			{/* Three to find; each wrong tap is one less "first try". */}
			<Next show={done} last onNext={() => onDone(3, Math.max(0, 3 - misses))} />
		</div>
	);
}

const ROUNDS = 4;

function WhichLetter({ onDone }: { onDone: ActivityProps["onDone"] }) {
	const rounds = useMemo(() => pick(ALL, ROUNDS).map((w) => {
		const alike = LOOK_ALIKE[w.letter] ?? [];
		const others = pick(LETTERS.map((l) => l.letter).filter((l) => l !== w.letter && !alike.includes(l)), 3 - alike.length);
		return { ...w, choices: shuffle([w.letter, ...alike, ...others]) };
	}), []);
	const r = useRounds(ROUNDS, onDone);
	const [picked, setPicked] = useState<{ letter: string; n: number } | null>(null);
	const w = rounds[r.round];
	return (
		<div className={s.board}>
			<div className={s.top}>
				<span />
				<Dots total={ROUNDS} done={r.round + (r.got ? 1 : 0)} />
			</div>
			<div className={s.things}>
				<span className={`${s.tilePicture} ${r.got ? s.yes : ""}`} aria-hidden="true">{w.picture}</span>
				<span className={s.pageLine}>{r.got ? <><b>{w.letter}</b>{w.word.slice(1)}</> : ""}</span>
			</div>
			<p className={s.prompt}>
				{r.got ? `Yes! ${w.word} starts with ${w.letter}.`
					: picked ? `${picked.letter} says ${SOUND[picked.letter] ?? picked.letter.toLowerCase()}. Say it slowly. Which letter starts it?`
					: "What is it? Say it slowly. Which letter does it start with?"}
			</p>
			<div className={s.tiles} style={{ "--cols": 4 } as CSSProperties}>
				{w.choices.map((l) => (
					<button key={`${r.round}-${l}-${picked?.letter === l ? picked.n : 0}`} type="button" aria-label={`Letter ${l}`}
						className={`${s.tile} ${r.got && l === w.letter ? s.tileRight : ""} ${picked?.letter === l ? (l === w.letter ? s.yes : s.nope) : ""}`}
						onClick={() => {
							setPicked({ letter: l, n: (picked?.n ?? 0) + 1 });
							r.tap(l === w.letter);
						}}>
						<span className={s.letter}>{l}</span>
					</button>
				))}
			</div>
			<Next show={r.got} last={r.round + 1 === ROUNDS} onNext={() => {
				setPicked(null);
				r.next();
			}} />
		</div>
	);
}
