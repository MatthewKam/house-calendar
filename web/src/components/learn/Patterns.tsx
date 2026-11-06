import { useMemo, useState, type CSSProperties } from "react";
import { Dots, Next } from "./parts";
import { pick, shuffle, useRounds, type ActivityProps } from "./rounds";
import s from "../../styles/Learn.module.css";

const THINGS = ["🍎", "🍌", "🐶", "🐱", "⭐", "🌙", "☀️", "🔴", "🔵", "🟡", "🚗", "🌸"];
const ROUNDS = 3;
/** The repeating part of each round: AB at level 1; ABB, AAB and ABC at level 2. */
const SHAPES: Record<number, number[][]> = {
	1: [[0, 1], [0, 1], [0, 1]],
	2: [[0, 1, 1], [0, 0, 1], [0, 1, 2]],
};

/** Patterns: what comes next? A wrong pick shows the part that repeats, to say along. */
export default function Patterns({ level, onDone }: ActivityProps) {
	const rounds = useMemo(() => (SHAPES[Math.min(level, 2)]).map((shape) => {
		const things = pick(THINGS, 3);
		const unit = shape.map((i) => things[i]);
		const shown = 7;
		const row = Array.from({ length: shown }, (_, i) => unit[i % unit.length]);
		const answer = unit[shown % unit.length];
		// The three things: the answer is always one of them (an AB pattern's third is a distraction).
		return { unit, row, answer, choices: shuffle(things) };
	}), [level]);
	const r = useRounds(ROUNDS, onDone);
	const [picked, setPicked] = useState<{ thing: string; n: number } | null>(null);
	const { unit, row, answer, choices } = rounds[r.round];
	const wrong = picked && picked.thing !== answer && !r.got;
	return (
		<div className={s.board}>
			<div className={s.top}>
				<span />
				<Dots total={ROUNDS} done={r.round + (r.got ? 1 : 0)} />
			</div>
			<p className={s.prompt}>{r.got ? "Yes! That's the pattern!" : "What comes next?"}</p>
			<div className={s.things}>
				{row.map((t, i) => (
					// After a wrong pick, the first repeat is picked out to say along.
					<span key={i} className={`${s.thing} ${wrong && i < unit.length ? s.counted : ""}`} aria-hidden="true">{t}</span>
				))}
				<span className={`${s.thing} ${s.gap} ${r.got ? s.yes : ""}`}>{r.got ? answer : "?"}</span>
			</div>
			<p className={s.hint}>{wrong ? `Say it with me: ${unit.join(" ")}, ${unit.join(" ")}…` : ""}</p>
			{!r.got && (
				<div className={s.tiles} style={{ "--cols": 3 } as CSSProperties}>
					{choices.map((c) => (
						<button key={`${r.round}-${c}-${picked?.thing === c ? picked.n : 0}`} type="button"
							className={`${s.tile} ${picked?.thing === c && c !== answer ? s.nope : ""}`}
							onClick={() => {
								setPicked({ thing: c, n: (picked?.n ?? 0) + 1 });
								r.tap(c === answer);
							}}>
							<span className={s.tilePicture} aria-hidden="true">{c}</span>
						</button>
					))}
				</div>
			)}
			<Next show={r.got} last={r.round + 1 === ROUNDS} onNext={() => {
				setPicked(null);
				r.next();
			}} />
		</div>
	);
}
