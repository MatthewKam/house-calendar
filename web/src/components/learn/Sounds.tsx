import { useEffect, useMemo, useState } from "react";
import { Pic } from "./art";
import { Board, fit, Hear } from "./parts";
import { animalsUpTo, type Animal } from "./things";
import { at, fresh, pick, shuffle, useRounds, type GameProps } from "./rounds";
import { noise } from "./sound";
import s from "../../styles/Learn.module.css";

/** Animals to choose from, by level. */
const CHOICES = [2, 3, 3, 4, 4, 6];
const ROUNDS = [3, 3, 3, 4, 4, 4];

/**
 * Who says that? (age 2): an animal's noise plays (and again with the big play button); tap who made
 * it. Every animal tapped makes its own noise. Farm animals first, then pets, then wild ones, and more
 * to choose from as it levels up.
 */
export default function Sounds({ level, onDone, onBack }: GameProps) {
	const total = at(ROUNDS, level);
	const rounds = useRounds(total, onDone);
	// Each round's animal and who's beside it, a new set each play.
	const plan = useMemo(() => {
		const pool = animalsUpTo(level);
		return fresh(`sounds.${level}`, pool, total, (a) => a.id).map((answer) => ({
			answer,
			choices: shuffle([answer, ...pick(pool.filter((a) => a.id !== answer.id), at(CHOICES, level) - 1)]),
		}));
	}, [level, total]);
	const { answer, choices } = plan[rounds.round];
	const [tapped, setTapped] = useState<{ id: string; n: number } | null>(null);

	// Each round starts by playing the noise.
	useEffect(() => {
		setTapped(null);
		const t = setTimeout(() => noise(answer), 400);
		return () => clearTimeout(t);
	}, [answer]);

	function tap(a: Animal) {
		noise(a);
		setTapped((t) => ({ id: a.id, n: (t?.n ?? 0) + 1 }));
		rounds.tap(a.id === answer.id);
	}

	return (
		<Board onBack={onBack} total={total} done={rounds.round + (rounds.got ? 1 : 0)} cheer={rounds.got}>
			{(box) => {
				const button = Math.min(110, Math.max(72, box.h * 0.18));
				const grid = fit(choices.length, { w: box.w, h: box.h - button - 24 }, { gap: 16, most: 300 });
				return (
					<div className={s.column}>
						<Hear size={button} onTap={() => noise(answer)} label="Hear the animal again" />
						<div className={s.grid} style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.size}px)`, gap: 16 }}>
							{choices.map((a) => {
								const isTapped = tapped?.id === a.id;
								const right = rounds.got && a.id === answer.id;
								return (
									<button key={`${a.id}-${isTapped ? tapped.n : 0}`} type="button" aria-label={a.name}
										className={`${s.tile} ${right ? `${s.tileRight} ${s.hop}` : isTapped ? s.wiggle : ""}`}
										style={{ width: grid.size, height: grid.size }} onClick={() => tap(a)}>
										<Pic id={a.id} />
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
