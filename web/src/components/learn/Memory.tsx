import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board, fit } from "./parts";
import { ANIMALS, FRUIT, TOYS } from "./things";
import { at, fresh, shuffle, type GameProps } from "./rounds";
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
 * Pairs (age 4): cards face down. Tap two to turn them over; a match stays face up, and two that don't
 * match shake, then turn back over. No sounds. More cards as it levels up, and a new set
 * each play. First try is finding them all without too many misses (one per pair).
 */
export default function Memory({ level, onDone, onBack }: GameProps) {
	const set = useMemo(() => fresh("pairs.sets", SETS, 1, (x) => x.name)[0], []);
	const pairs = Math.min(at(PAIRS, level), set.cards.length);
	const cards = useMemo(() => shuffle(fresh(`pairs.${set.name}`, set.cards, pairs, (x) => x.id).flatMap((c) => [c, c])), [set, pairs]);
	const [up, setUp] = useState<number[]>([]);
	const [matched, setMatched] = useState<number[]>([]);
	const [misses, setMisses] = useState(0);
	// Two that don't match, shaking before they turn back.
	const [shaking, setShaking] = useState<number[]>([]);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	useEffect(() => () => timers.current.forEach(clearTimeout), []);

	function flip(i: number) {
		if (up.length === 2 || up.includes(i) || matched.includes(i)) return;
		const card = cards[i];
		if (up.length === 0) {
			setUp([i]);
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
			if (now.length === cards.length) {
				timers.current.push(setTimeout(() => onDone(1, misses <= pairs ? 1 : 0), 3200));
			}
		} else {
			setMisses(misses + 1);
			// A moment to look, then the two shake ("not a pair"), then turn back over.
			timers.current.push(setTimeout(() => setShaking([other, i]), 700));
			timers.current.push(setTimeout(() => {
				setShaking([]);
				setUp([]);
			}, 1300));
		}
	}

	return (
		<Board onBack={onBack} cheer={matched.length === cards.length}>
			{(box) => {
				const grid = fit(cards.length, box, { gap: 10, shape: 0.75, most: 170 });
				return (
					<div className={s.column}>
						<div className={s.grid} style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.size}px)`, gap: 10, "--back": set.back } as CSSProperties}>
							{cards.map((c, i) => {
								const face = up.includes(i) || matched.includes(i);
								return (
									<button key={i} type="button" className={`${s.card} ${face ? s.cardUp : ""} ${matched.includes(i) ? s.cardMatched : ""} ${shaking.includes(i) ? s.cardShake : ""}`}
										style={{ width: grid.size, height: grid.size / 0.75 }} onClick={() => flip(i)} aria-label={face ? c.name : "A card, face down"}>
										<span className={s.cardInner}>
											<span className={s.cardBack} aria-hidden="true" />
											<span className={s.cardFace}><Pic id={c.id} /></span>
										</span>
									</button>
								);
							})}
						</div>
					</div>
				);
			}}
		</Board>
	);
}
