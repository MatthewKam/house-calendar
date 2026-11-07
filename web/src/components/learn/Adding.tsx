import { useEffect, useMemo, useState } from "react";
import { Pic } from "./art";
import { Board, Next } from "./parts";
import { FRUIT, NUMBER_WORDS } from "./things";
import { at, between, pick, shuffle, useRounds, type GameProps } from "./rounds";
import { say } from "./sound";
import s from "../../styles/Learn.module.css";

/** Each side's smallest and biggest number, by level. From level 4 the total goes in on a number pad. */
const SIDES: [number, number][] = [[1, 3], [1, 4], [2, 5], [2, 5], [3, 7], [4, 10]];
const PAD_FROM = 4;
/** Numbers to choose from, before the pad. */
const CHOICES = [3, 4, 4];
const ROUNDS = 3;

const said = (n: number) => NUMBER_WORDS[n] ?? String(n);

/**
 * Add them up (age 4): two plates, each with a number on its sign. Tap a plate's basket to put a fruit
 * on it (tap a fruit to take it off) until each plate has its number, then say how many in all: pick
 * the number, or from level 4, type it on a number pad. Too many on a plate shows it in yellow.
 */
export default function Adding({ level, onDone, onBack }: GameProps) {
	const rounds = useRounds(ROUNDS, onDone);
	const pad = level >= PAD_FROM;
	const plan = useMemo(() => Array.from({ length: ROUNDS }, () => {
		const [lo, hi] = at(SIDES, level);
		const [a, b] = pick(FRUIT, 2);
		return { a: between(lo, hi), b: between(lo, hi), fa: a, fb: b };
	}), [level]);
	const r = plan[rounds.round];
	const total = r.a + r.b;
	const [left, setLeft] = useState(0);
	const [right, setRight] = useState(0);
	const [typed, setTyped] = useState("");
	const [wrong, setWrong] = useState<number | null>(null);
	const filled = left === r.a && right === r.b;
	const options = useMemo(() => {
		const near = shuffle([total - 2, total - 1, total + 1, total + 2].filter((x) => x > 0));
		return shuffle([total, ...near.slice(0, at(CHOICES, level) - 1)]);
	}, [total, level]);

	useEffect(() => {
		setLeft(0);
		setRight(0);
		setTyped("");
		setWrong(null);
	}, [rounds.round]);

	function put(side: "a" | "b", change: 1 | -1) {
		if (rounds.got) return;
		const [n, set] = side === "a" ? [left, setLeft] : [right, setRight];
		const next = Math.max(0, n + change);
		set(next);
		say(said(next));
	}
	function answer(x: number) {
		if (x === total) {
			say(`Yes! ${said(r.a)} and ${said(r.b)} make ${said(total)}!`);
			rounds.tap(true);
		} else {
			setWrong(x);
			setTyped("");
			rounds.tap(false);
		}
	}

	const plate = (side: "a" | "b") => {
		const [n, want, fruit] = side === "a" ? [left, r.a, r.fa] : [right, r.b, r.fb];
		return (
			<div className={s.side}>
				<span className={`${s.sign} ${n === want ? s.signDone : ""}`} aria-label={`The sign says ${want}`}>{want}</span>
				<div className={`${s.plate} ${n > want ? s.plateOver : ""}`} aria-label={`${n} on this plate`}>
					{Array.from({ length: n }, (_, i) => (
						<button key={i} type="button" className={s.onPlate} onClick={() => put(side, -1)} aria-label={`Take a ${fruit.one} off`}>
							<Pic id={fruit.id} />
						</button>
					))}
				</div>
				<button type="button" className={s.basket} onClick={() => put(side, 1)} disabled={rounds.got} aria-label={`Put a ${fruit.one} on`}>
					<Pic id={fruit.id} />
					<span aria-hidden="true">+</span>
				</button>
			</div>
		);
	};

	return (
		<Board onBack={onBack} total={ROUNDS} done={rounds.round + (rounds.got ? 1 : 0)}>
			<div className={s.plates}>
				{plate("a")}
				<span className={s.plus} aria-hidden="true">+</span>
				{plate("b")}
				<span className={s.plus} aria-hidden="true">=</span>
				<span className={`${s.answer} ${rounds.got ? s.answerGot : ""}`}>{rounds.got ? total : typed || "?"}</span>
			</div>
			{filled && !rounds.got && (pad ? (
				<div className={s.numPad}>
					{["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"].map((k) => (
						<button key={k} type="button" className={`${s.choice} ${k === "ok" ? s.choiceGo : ""}`}
							disabled={(k === "ok" || k === "back") && !typed}
							aria-label={k === "back" ? "Delete" : k === "ok" ? "That's it" : k}
							onClick={() => k === "back" ? setTyped(typed.slice(0, -1)) : k === "ok" ? answer(Number(typed)) : typed.length < 2 && setTyped(typed + k)}>
							{k === "back" ? "⌫" : k === "ok" ? "✓" : k}
						</button>
					))}
				</div>
			) : (
				<div className={s.choices}>
					{options.map((x) => (
						<button key={x} type="button" className={`${s.choice} ${wrong === x ? s.wiggle : ""}`} onClick={() => answer(x)}>{x}</button>
					))}
				</div>
			))}
			<Next show={rounds.got} onNext={rounds.next} last={rounds.round + 1 >= ROUNDS} />
		</Board>
	);
}
