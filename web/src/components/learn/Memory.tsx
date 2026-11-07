import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board } from "./parts";
import { ANIMALS, FRUIT, TOYS } from "./things";
import { any, at, pick, shuffle, type GameProps } from "./rounds";
import { noise, say } from "./sound";
import s from "../../styles/Learn.module.css";

/** Pairs on the table, by level. */
const PAIRS = [3, 4, 6, 8, 10, 12];

/** A different set of cards each play, each with its own back. */
const SETS = [
	{ name: "animals", back: "#5aa0e6", cards: ANIMALS.map((a) => ({ id: a.id, name: a.name })) },
	{ name: "fruit", back: "#e8707c", cards: FRUIT.map((f) => ({ id: f.id, name: f.one })) },
	{ name: "toys", back: "#7a5cc8", cards: TOYS.map((t) => ({ id: t.id, name: t.one })) },
];

/**
 * Card matching (age 4): cards face down. Tap two to turn them over; a match stays face up (an animal
 * says hello), and two that don't match turn back over. More cards as it levels up, and a new set each
 * play. First try is finding them all without too many misses (one per pair).
 */
export default function Memory({ level, onDone, onBack }: GameProps) {
	const set = useMemo(() => any(SETS), []);
	const pairs = Math.min(at(PAIRS, level), set.cards.length);
	const cards = useMemo(() => shuffle(pick(set.cards, pairs).flatMap((c) => [c, c])), [set, pairs]);
	const [up, setUp] = useState<number[]>([]);
	const [matched, setMatched] = useState<number[]>([]);
	const [misses, setMisses] = useState(0);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	useEffect(() => () => timers.current.forEach(clearTimeout), []);

	function flip(i: number) {
		if (up.length === 2 || up.includes(i) || matched.includes(i)) return;
		const card = cards[i];
		const animal = ANIMALS.find((a) => a.id === card.id);
		if (up.length === 0) {
			setUp([i]);
			say(card.name);
			return;
		}
		const other = up[0];
		setUp([other, i]);
		if (cards[other].id === card.id) {
			const now = [...matched, other, i];
			timers.current.push(setTimeout(() => {
				setMatched(now);
				setUp([]);
			}, 500));
			if (animal) noise(animal);
			else say(`Two ${card.name}s!`);
			if (now.length === cards.length) {
				timers.current.push(setTimeout(() => onDone(1, misses <= pairs ? 1 : 0), 3200));
			}
		} else {
			say(card.name);
			setMisses(misses + 1);
			timers.current.push(setTimeout(() => setUp([]), 1300));
		}
	}

	const cols = cards.length <= 6 ? 3 : cards.length <= 16 ? 4 : 6;
	return (
		<Board onBack={onBack}>
			<div className={s.cards} style={{ "--cols": cols, "--back": set.back } as CSSProperties}>
				{cards.map((c, i) => {
					const face = up.includes(i) || matched.includes(i);
					return (
						<button key={i} type="button" className={`${s.card} ${face ? s.cardUp : ""} ${matched.includes(i) ? s.cardMatched : ""}`}
							onClick={() => flip(i)} aria-label={face ? c.name : "A card, face down"}>
							<span className={s.cardInner}>
								<span className={s.cardBack} aria-hidden="true" />
								<span className={s.cardFace}><Pic id={c.id} /></span>
							</span>
						</button>
					);
				})}
			</div>
		</Board>
	);
}
