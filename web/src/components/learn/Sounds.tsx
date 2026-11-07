import { useEffect, useMemo, useState } from "react";
import { Pic } from "./art";
import { Board, fit, Hear, SLIDE_MS } from "./parts";
import { animalsUpTo, type Animal } from "./things";
import { at, fresh, pick, shuffle, useRounds, type GameProps } from "./rounds";
import { noise } from "./sound";
import s from "../../styles/Learn.module.css";

/** Animals to choose from, by level. */
const CHOICES = [2, 3, 3, 4, 4, 6];
const ROUNDS = [3, 3, 3, 4, 4, 4];

/**
 * Who says that? (age 2): an animal's noise as a word ("Moo!"), with a play button beside it to hear it
 * (nothing plays by itself); tap who says it. Each animal tapped makes its own noise, its word under it
 * while it does. Farm animals first, then pets, then wild ones, and more to choose from as it levels up.
 */
export default function Sounds({ level, onDone, onBack }: GameProps) {
	const total = at(ROUNDS, level);
	// Right: once its noise is done, the mascot parades across with confetti, then the next round.
	const rounds = useRounds(total, onDone, SLIDE_MS);
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

	useEffect(() => {
		setTapped(null);
		setFound(false);
	}, [answer]);

	// The animal whose noise is playing: its word shows under it until the noise ends (a second at least,
	// so there's time to see it).
	const [saying, setSaying] = useState<string | null>(null);
	// The right one's been tapped and its noise is playing: the cheer waits for it to finish.
	const [found, setFound] = useState(false);
	function tap(a: Animal) {
		if (found) return;
		const right = a.id === answer.id;
		if (right) setFound(true);
		else rounds.tap(false);
		setSaying(a.id);
		setTapped((t) => ({ id: a.id, n: (t?.n ?? 0) + 1 }));
		const from = Date.now();
		noise(a, () => setTimeout(() => {
			setSaying((now) => (now === a.id ? null : now));
			if (right) rounds.tap(true);
		}, Math.max(0, 1000 - (Date.now() - from))));
	}

	return (
		<Board onBack={onBack} total={total} done={rounds.round + (rounds.got ? 1 : 0)} cheer={rounds.got && "slide"}>
			{(box) => {
				// The noise as big as fits beside its play button: on one line, or (a long one, like
				// cock-a-doodle-doo, on a narrow screen) more, with room kept for them.
				const button = Math.min(88, Math.max(52, box.h * 0.13));
				const room = box.w - button - 32;
				const word = `${answer.says}!`;
				// As few lines as keep it big (it breaks at its hyphens and spaces, so a line can run a letter long).
				const sizeFor = (n: number) => Math.min(button * (n === 1 ? 0.85 : 0.7), room / ((Math.ceil(word.length / n) + (n > 1 ? 1 : 0)) * 0.6));
				const lines = [1, 2, 3].find((n) => sizeFor(n) >= 30) ?? 3;
				const font = Math.floor(sizeFor(lines));
				const prompt = Math.max(button, lines * font * 1.15 + 8);
				const grid = fit(choices.length, { w: box.w, h: box.h - prompt - 24 }, { gap: 16, most: 300 });
				return (
					<div className={s.column}>
						{/* The noise as a word, and the play button beside it if they need to hear it. */}
						<div className={s.sayRow} style={{ height: prompt }}>
							<span className={s.sayWord} style={{ fontSize: font, maxWidth: room, whiteSpace: lines === 1 ? "nowrap" : "normal" }}>{word}</span>
							<Hear size={button} onTap={() => noise(answer)} label="Hear it" />
						</div>
						<div className={s.grid} style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.size}px)`, gap: 16 }}>
							{choices.map((a) => {
								const isTapped = tapped?.id === a.id;
								const right = (found || rounds.got) && a.id === answer.id;
								return (
									<button key={`${a.id}-${isTapped ? tapped.n : 0}`} type="button" aria-label={a.name}
										className={`${s.tile} ${right ? `${s.tileRight} ${s.hop}` : isTapped ? s.wiggle : ""}`}
										style={{ width: grid.size, height: grid.size }} onClick={() => tap(a)}>
										<Pic id={a.id} />
										{saying === a.id && <span className={s.tileSays}>{a.says}!</span>}
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
