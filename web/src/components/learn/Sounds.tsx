import { useEffect, useMemo, useState } from "react";
import { Pic } from "./art";
import { Board, Hear, Next } from "./parts";
import { animalsUpTo, type Animal } from "./things";
import { at, pick, shuffle, useRounds, type GameProps } from "./rounds";
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
		return pick(pool, total).map((answer) => ({
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
		<Board onBack={onBack} total={total} done={rounds.round + (rounds.got ? 1 : 0)}>
			<div className={s.ask}>
				<Hear big onTap={() => noise(answer)} label="Hear the animal again" />
			</div>
			<div className={s.tiles} style={{ "--cols": Math.min(choices.length, 3) } as React.CSSProperties}>
				{choices.map((a) => {
					const isTapped = tapped?.id === a.id;
					const right = rounds.got && a.id === answer.id;
					return (
						<button key={`${a.id}-${isTapped ? tapped.n : 0}`} type="button" aria-label={a.name}
							className={`${s.tile} ${right ? `${s.tileRight} ${s.hop}` : isTapped ? s.wiggle : ""}`}
							onClick={() => tap(a)}>
							<Pic id={a.id} className={s.tilePic} />
						</button>
					);
				})}
			</div>
			<Next show={rounds.got} onNext={rounds.next} last={rounds.round + 1 >= total} />
		</Board>
	);
}
