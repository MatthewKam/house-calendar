import { useMemo, useState } from "react";
import { Dots, Next } from "./parts";
import { pick, shuffle, useRounds, type ActivityProps } from "./rounds";
import s from "../../styles/Learn.module.css";

const FRUIT = ["🍎", "🍐", "🍊", "🍋", "🍌", "🍓", "🍇", "🍑", "🥕", "🧁", "⚽", "🚗"];
const ROUNDS = 3;
/** The right number and its neighbors (never 0), in a jumbled order. */
const choicesFor = (n: number, count: number) => {
	const near = [n - 2, n - 1, n + 1, n + 2].filter((x) => x > 0);
	return shuffle([n, ...pick(near, count - 1)]);
};

/**
 * Counting. Level 1: tap each thing to count it (each gets its number), then pick how many; a wrong
 * number counts again together. Level 2: two groups to put together, up to 10.
 */
export default function Counting({ level, onDone }: ActivityProps) {
	return level >= 2 ? <Adding onDone={onDone} /> : <Count onDone={onDone} />;
}

function Count({ onDone }: { onDone: ActivityProps["onDone"] }) {
	const rounds = useMemo(() => pick([2, 3, 4, 5, 6], ROUNDS).map((n) =>
		({ n, thing: FRUIT[Math.floor(Math.random() * FRUIT.length)], choices: choicesFor(n, 3) })), []);
	const r = useRounds(ROUNDS, onDone);
	const [counted, setCounted] = useState<number[]>([]);
	const [wrong, setWrong] = useState<number | null>(null);
	const { n, thing, choices } = rounds[r.round];
	const allCounted = counted.length === n;
	return (
		<div className={s.board}>
			<div className={s.top}>
				<span />
				<Dots total={ROUNDS} done={r.round + (r.got ? 1 : 0)} />
			</div>
			<p className={s.prompt}>
				{r.got ? `Yes! ${n}!` : wrong !== null ? "Let's count them again, together." : allCounted ? "How many?" : counted.length ? `${counted.length}…` : "Tap each one to count it."}
			</p>
			<div className={s.things}>
				{Array.from({ length: n }, (_, i) => {
					const at = counted.indexOf(i);
					return (
						<button key={`${r.round}-${i}`} type="button" className={`${s.thing} ${at >= 0 ? `${s.counted} ${s.yes}` : ""}`}
							aria-label={at >= 0 ? `Counted, ${at + 1}` : "Count this one"}
							onClick={() => {
								if (at >= 0 || r.got) return;
								setWrong(null);
								setCounted([...counted, i]);
							}}>
							<span aria-hidden="true">{thing}</span>
							{at >= 0 && <span className={s.badge}>{at + 1}</span>}
						</button>
					);
				})}
			</div>
			{allCounted && !r.got && (
				<div className={s.numbers}>
					{choices.map((c) => (
						<button key={c} type="button" className={s.number} onClick={() => {
							r.tap(c === n);
							// Wrong: count them again rather than guess.
							if (c !== n) {
								setWrong(c);
								setCounted([]);
							}
						}}>{c}</button>
					))}
				</div>
			)}
			<Next show={r.got} last={r.round + 1 === ROUNDS} onNext={() => {
				setCounted([]);
				setWrong(null);
				r.next();
			}} />
		</div>
	);
}

function Adding({ onDone }: { onDone: ActivityProps["onDone"] }) {
	const rounds = useMemo(() => Array.from({ length: ROUNDS }, (_, i) => {
		// A bit bigger each round, up to 10.
		const a = 2 + Math.floor(Math.random() * (2 + i));
		const b = 1 + Math.floor(Math.random() * Math.min(3 + i, 10 - a));
		const [pa, pb] = pick(FRUIT, 2);
		return { a, b, pa, pb, choices: choicesFor(a + b, 4) };
	}), []);
	const r = useRounds(ROUNDS, onDone);
	const [wrong, setWrong] = useState(false);
	const { a, b, pa, pb, choices } = rounds[r.round];
	return (
		<div className={s.board}>
			<div className={s.top}>
				<span />
				<Dots total={ROUNDS} done={r.round + (r.got ? 1 : 0)} />
			</div>
			<p className={s.prompt}>
				{r.got ? `${a} and ${b} make ${a + b}!` : wrong ? "Not quite. Count them all, with your finger." : `${a} and ${b} more. How many in all?`}
			</p>
			<div className={s.sum}>
				<span className={s.group} aria-label={`${a}`}>{pa.repeat(a)}</span>
				<span aria-hidden="true">+</span>
				<span className={s.group} aria-label={`${b}`}>{pb.repeat(b)}</span>
				<span aria-hidden="true">=</span>
				<span className={`${s.thing} ${s.gap} ${r.got ? s.yes : ""}`}>{r.got ? a + b : "?"}</span>
			</div>
			{!r.got && (
				<div className={s.numbers}>
					{choices.map((c) => (
						<button key={c} type="button" className={s.number} onClick={() => {
							r.tap(c === a + b);
							setWrong(c !== a + b);
						}}>{c}</button>
					))}
				</div>
			)}
			<Next show={r.got} last={r.round + 1 === ROUNDS} onNext={() => {
				setWrong(false);
				r.next();
			}} />
		</div>
	);
}
