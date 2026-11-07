import { useEffect, useMemo, useState } from "react";
import { Pic } from "./art";
import { Board, fit } from "./parts";
import { FRUIT } from "./things";
import { at, between, fresh, shuffle, useRounds, type GameProps } from "./rounds";
import s from "../../styles/Learn.module.css";

/** The most there can be, by level. From level 3 there's a "How many?" after counting. */
const MOST = [3, 4, 5, 7, 9, 10];
const ASK_FROM = 3;
const ROUNDS = 3;

/**
 * Count the apples (age 2): tap each one to count it, and its number shows under it. Once they're all
 * counted, the cheer; from level 3 the kid picks how many first (a wrong pick clears the numbers, to
 * count again together). Different fruit each round.
 */
export default function Apples({ level, onDone, onBack }: GameProps) {
	const rounds = useRounds(ROUNDS, onDone);
	const asking = level >= ASK_FROM;
	const plan = useMemo(() => fresh("apples.fruit", FRUIT, ROUNDS, (f) => f.id).map((fruit) => ({
		fruit,
		n: between(Math.max(2, at(MOST, level) - 2), at(MOST, level)),
	})), [level]);
	const { fruit, n } = plan[rounds.round];
	// Each fruit's number, in the order tapped.
	const [counted, setCounted] = useState<Record<number, number>>({});
	const [wrong, setWrong] = useState<number | null>(null);
	const done = Object.keys(counted).length;
	const all = done === n;
	const options = useMemo(() => shuffle([n - 1, n, n + 1].filter((x) => x > 0)), [n]);

	useEffect(() => {
		setCounted({});
		setWrong(null);
	}, [rounds.round]);

	function count(i: number) {
		if (counted[i] !== undefined || rounds.got) return;
		const number = done + 1;
		setCounted({ ...counted, [i]: number });
		setWrong(null);
		if (number === n && !asking) rounds.tap(true);
	}
	function answer(x: number) {
		if (x === n) return rounds.tap(true);
		// Count again, together, rather than guess.
		setWrong(x);
		setCounted({});
		rounds.tap(false);
	}

	return (
		<Board onBack={onBack} total={ROUNDS} done={rounds.round + (rounds.got ? 1 : 0)} cheer={rounds.got}>
			{(box) => {
				// Room under the fruit for the numbers to pick (from level 3).
				const below = asking ? Math.min(110, box.h * 0.22) : 0;
				const grid = fit(n, { w: box.w, h: box.h - below }, { gap: 12, shape: 0.8, most: 220 });
				return (
					<div className={s.column}>
						<div className={s.grid} style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.size}px)`, gap: 12 }}>
							{Array.from({ length: n }, (_, i) => (
								<button key={i} type="button" className={`${s.fruit} ${counted[i] !== undefined ? s.counted : ""}`}
									style={{ width: grid.size, height: grid.size / 0.8 }} onClick={() => count(i)}
									aria-label={counted[i] !== undefined ? `${fruit.one} ${counted[i]}` : `${fruit.one}, not counted yet`}>
									<Pic id={fruit.id} className={counted[i] !== undefined ? s.pop : ""} />
									<span className={s.fruitNumber} style={{ fontSize: grid.size * 0.26 }}>{counted[i] ?? ""}</span>
								</button>
							))}
						</div>
						{asking && (
							<div className={s.choices} style={{ minHeight: below }}>
								{all && options.map((x) => (
									<button key={x} type="button" disabled={rounds.got} onClick={() => answer(x)}
										className={`${s.choice} ${rounds.got && x === n ? s.choiceRight : wrong === x ? s.wiggle : ""}`}
										style={{ width: below * 0.8, height: below * 0.8, fontSize: below * 0.4 }}>
										{x}
									</button>
								))}
							</div>
						)}
					</div>
				);
			}}
		</Board>
	);
}
