import { useMemo, useState, type CSSProperties } from "react";
import { Dots, Next } from "./parts";
import { pick, shuffle, useRounds, type ActivityProps } from "./rounds";
import s from "../../styles/Learn.module.css";

const ANIMALS = [
	{ name: "cow", picture: "🐄", says: "Moo" },
	{ name: "sheep", picture: "🐑", says: "Baa" },
	{ name: "duck", picture: "🦆", says: "Quack" },
	{ name: "dog", picture: "🐶", says: "Woof" },
	{ name: "cat", picture: "🐱", says: "Meow" },
	{ name: "pig", picture: "🐷", says: "Oink" },
	{ name: "horse", picture: "🐴", says: "Neigh" },
	{ name: "chicken", picture: "🐔", says: "Cluck" },
	{ name: "frog", picture: "🐸", says: "Ribbit" },
	{ name: "lion", picture: "🦁", says: "Roar" },
	{ name: "owl", picture: "🦉", says: "Hoo" },
	{ name: "bee", picture: "🐝", says: "Buzz" },
];
const ROUNDS = 3;

/** Who says Moo? (Little): a sound, three animals; any other animal just says its own sound. */
export default function Animals({ onDone }: ActivityProps) {
	// Each round: who's asked for, and the three shown.
	const rounds = useMemo(() => pick(ANIMALS, ROUNDS).map((ask) =>
		({ ask, shown: shuffle([ask, ...pick(ANIMALS.filter((a) => a !== ask), 2)]) })), []);
	const r = useRounds(ROUNDS, onDone);
	const [tapped, setTapped] = useState<{ name: string; n: number } | null>(null);
	const { ask, shown } = rounds[r.round];
	const other = tapped && tapped.name !== ask.name ? ANIMALS.find((a) => a.name === tapped.name) : null;

	return (
		<div className={s.board}>
			<div className={s.top}>
				<span />
				<Dots total={ROUNDS} done={r.round + (r.got ? 1 : 0)} />
			</div>
			<p className={s.say}>{ask.says}!</p>
			<p className={s.hint}>
				{r.got ? `Yes! The ${ask.name} says ${ask.says}!` : other ? `That's the ${other.name}. ${other.says}! Who says ${ask.says}?` : `Who says ${ask.says}?`}
			</p>
			<div className={s.tiles} style={{ "--cols": 3 } as CSSProperties}>
				{shown.map((a) => {
					const isTapped = tapped?.name === a.name;
					const right = a === ask;
					return (
						<button key={`${r.round}-${a.name}-${isTapped ? tapped.n : 0}`} type="button" aria-label={a.name}
							className={`${s.tile} ${isTapped ? (right ? s.yes : s.nope) : ""} ${r.got && right ? s.tileRight : ""}`}
							onClick={() => {
								setTapped({ name: a.name, n: (tapped?.n ?? 0) + 1 });
								r.tap(right);
							}}>
							<span className={s.tilePicture} aria-hidden="true">{a.picture}</span>
							{isTapped && <span>{a.says}!</span>}
						</button>
					);
				})}
			</div>
			<Next show={r.got} last={r.round + 1 === ROUNDS} onNext={() => {
				setTapped(null);
				r.next();
			}} />
		</div>
	);
}
