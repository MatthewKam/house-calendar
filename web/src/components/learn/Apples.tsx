import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board, Next } from "./parts";
import { FRUIT, NUMBER_WORDS } from "./things";
import { at, between, pick, shuffle, useRounds, type GameProps } from "./rounds";
import { say } from "./sound";
import s from "../../styles/Learn.module.css";

/** The most there can be, by level. From level 3 there's a "How many?" after counting. */
const MOST = [3, 4, 5, 7, 9, 10];
const ASK_FROM = 3;
const ROUNDS = 3;

/**
 * Count the apples (age 2): tap each one to count it, and its number shows under it, said aloud. Once
 * they're all counted it says how many; from level 3 the kid picks how many (a wrong pick clears the
 * numbers, to count again together). Different fruit each round.
 */
export default function Apples({ level, onDone, onBack }: GameProps) {
	const rounds = useRounds(ROUNDS, onDone);
	const asking = level >= ASK_FROM;
	const plan = useMemo(() => pick(FRUIT, ROUNDS).map((fruit) => ({
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
		say(NUMBER_WORDS[number]);
		if (number === n && !asking) rounds.tap(true);
	}
	function answer(x: number) {
		if (x === n) {
			say(`Yes! ${NUMBER_WORDS[n]} ${fruit.many}!`);
			rounds.tap(true);
		} else {
			// Count again, together, rather than guess.
			setWrong(x);
			setCounted({});
			rounds.tap(false);
		}
	}

	return (
		<Board onBack={onBack} total={ROUNDS} done={rounds.round + (rounds.got ? 1 : 0)}>
			<div className={s.fruitRow} style={{ "--n": n } as CSSProperties}>
				{Array.from({ length: n }, (_, i) => (
					<button key={i} type="button" className={`${s.fruit} ${counted[i] !== undefined ? s.counted : ""}`}
						onClick={() => count(i)} aria-label={counted[i] !== undefined ? `${fruit.one} ${counted[i]}` : `${fruit.one}, not counted yet`}>
						<Pic id={fruit.id} className={counted[i] !== undefined ? s.pop : ""} />
						<span className={s.fruitNumber}>{counted[i] ?? ""}</span>
					</button>
				))}
			</div>
			{asking && all && !rounds.got && (
				<div className={s.choices}>
					{options.map((x) => (
						<button key={x} type="button" className={`${s.choice} ${wrong === x ? s.wiggle : ""}`} onClick={() => answer(x)}>{x}</button>
					))}
				</div>
			)}
			{rounds.got && <p className={s.big}>{n}</p>}
			<Next show={rounds.got} onNext={rounds.next} last={rounds.round + 1 >= ROUNDS} />
		</Board>
	);
}
