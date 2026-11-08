import { useEffect, useMemo, useRef, useState } from "react";
import { Pic } from "./art";
import { Board, fit } from "./parts";
import { FRUIT } from "./things";
import { at, between, CHEER_MS, fresh, shuffle, type GameProps } from "./rounds";
import { sayNumber } from "./sound";
import s from "../../styles/Learn.module.css";

/** The most there can be, by level. From level 3 there's a "How many?" after counting. */
const MOST = [3, 4, 5, 7, 9, 10];
const ASK_FROM = 3;
const ROUNDS = 3;
/** A moment to see it's right before moving on (ms), and how long the get-ready screen shows. */
const PAUSE = 800;
const GET_READY = 1100;

/**
 * Counting (age 2): tap each one to count it; the count so far shows big at the top and is said out
 * loud, and the one tapped goes flat and can't be tapped again. From level 3 the kid picks how many at
 * the end (a wrong pick clears the count, to count again together). Right: a moment to see it, then a
 * get-ready screen with the next fruit; after the last round, a moment, then the hooray.
 */
export default function Apples({ level, onDone, onBack }: GameProps) {
	// Rounds: right gets a moment to see, then a get-ready screen before the next; after the last, a moment,
	// then the hooray, then the end.
	const [round, setRound] = useState(0);
	const [got, setGot] = useState(false);
	const [phase, setPhase] = useState<"play" | "next" | "hooray">("play");
	const missed = useRef(false);
	const firstTry = useRef(0);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
	useEffect(() => () => timers.current.forEach(clearTimeout), []);
	function right() {
		setGot(true);
		if (!missed.current) firstTry.current += 1;
		if (round + 1 >= ROUNDS) {
			later(() => setPhase("hooray"), PAUSE);
			later(() => onDone(ROUNDS, firstTry.current), PAUSE + CHEER_MS + 400);
		} else {
			later(() => setPhase("next"), PAUSE);
			later(() => {
				setRound(round + 1);
				setGot(false);
				missed.current = false;
				setPhase("play");
			}, PAUSE + GET_READY);
		}
	}
	const asking = level >= ASK_FROM;
	const plan = useMemo(() => fresh("apples.fruit", FRUIT, ROUNDS, (f) => f.id).map((fruit) => ({
		fruit,
		n: between(Math.max(2, at(MOST, level) - 2), at(MOST, level)),
	})), [level]);
	const { fruit, n } = plan[round];
	// Each fruit's number, in the order tapped.
	const [counted, setCounted] = useState<Record<number, number>>({});
	const [wrong, setWrong] = useState<number | null>(null);
	const done = Object.keys(counted).length;
	const all = done === n;
	const options = useMemo(() => shuffle([n - 1, n, n + 1].filter((x) => x > 0)), [n]);

	useEffect(() => {
		setCounted({});
		setWrong(null);
	}, [round]);

	function count(i: number) {
		if (counted[i] !== undefined || got) return;
		const number = done + 1;
		setCounted({ ...counted, [i]: number });
		sayNumber(number);
		setWrong(null);
		if (number === n && !asking) right();
	}
	function answer(x: number) {
		if (x === n) return right();
		// Count again, together, rather than guess.
		setWrong(x);
		setCounted({});
		missed.current = true;
	}

	return (
		<Board onBack={onBack} total={ROUNDS} done={round + (got ? 1 : 0)} cheer={phase === "hooray"}>
			{(box) => {
				// Between rounds: the next fruit, on its own, popping in.
				if (phase === "next") {
					const upNext = plan[round + 1].fruit;
					return (
						<div className={s.column}>
							<span className={`${s.getReady} ${s.pop}`} style={{ width: Math.min(box.w, box.h) * 0.4, height: Math.min(box.w, box.h) * 0.4 }}>
								<Pic id={upNext.id} />
							</span>
						</div>
					);
				}
				// Room under the fruit for the numbers to pick (from level 3).
				const below = asking ? Math.min(110, box.h * 0.22) : 0;
				// The count so far, big, at the top.
				const top = Math.min(120, Math.max(60, box.h * 0.16));
				const grid = fit(n, { w: box.w, h: box.h - below - top - 16 }, { gap: 12, most: 220 });
				return (
					<div className={s.column}>
						<span key={done} className={`${s.countNow} ${done ? s.pop : ""}`} style={{ fontSize: top * 0.9, height: top }}
							aria-live="polite">{done}</span>
						<div className={s.grid} style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.size}px)`, gap: 12 }}>
							{Array.from({ length: n }, (_, i) => (
								<button key={i} type="button" className={`${s.fruit} ${counted[i] !== undefined ? s.counted : ""}`}
									disabled={counted[i] !== undefined}
									style={{ width: grid.size, height: grid.size }} onClick={() => count(i)}
									aria-label={counted[i] !== undefined ? `${fruit.one} ${counted[i]}` : `${fruit.one}, not counted yet`}>
									<Pic id={fruit.id} className={counted[i] !== undefined ? s.pop : ""} />
								</button>
							))}
						</div>
						{asking && (
							<div className={s.choices} style={{ minHeight: below }}>
								{all && options.map((x) => (
									<button key={x} type="button" disabled={got} onClick={() => answer(x)}
										className={`${s.choice} ${got && x === n ? s.choiceRight : wrong === x ? s.wiggle : ""}`}
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
