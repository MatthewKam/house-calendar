import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board } from "./parts";
import { ANIMALS, type Animal } from "./things";
import { any, at, CHEER_MS, fresh, type GameProps } from "./rounds";
import { noise } from "./sound";
import s from "../../styles/Learn.module.css";

/** Bubbles to pop (the ones that count) in a play, by level. */
const TARGETS = [8, 10, 6, 8, 6, 8];
/** Most bubbles up at once, and a new one every so often (ms), by level. */
const AT_ONCE = [3, 4, 4, 5, 5, 6];
const EVERY = [1300, 1100, 1000, 900, 900, 800];
/** How long a bubble takes to float up and away (ms), by level. */
const RISE = [9000, 8000, 8000, 7000, 7000, 6500];
/** From level 3, only one animal counts; from level 5, one colour. */
const FIND_ANIMAL = 3;
const FIND_COLOUR = 5;
/** How often a new bubble is one that counts, while finding one. */
const TARGET_SHARE = 0.45;

const COLOURS = [
	{ id: "red", name: "red", fill: "#ff5a5a" },
	{ id: "blue", name: "blue", fill: "#4a90ff" },
	{ id: "yellow", name: "yellow", fill: "#ffd23a" },
	{ id: "green", name: "green", fill: "#4cc76a" },
	{ id: "purple", name: "purple", fill: "#a66bff" },
] as const;
type Colour = (typeof COLOURS)[number];

/** A bubble: what's in it (an animal, or a colour), where it floats, and whether it's been popped. */
interface Bubble {
	id: number;
	animal?: Animal;
	colour?: Colour;
	/** Across the screen from Sprig's wand: where it ends up (0–1 of the width), and its wobble. */
	to: number;
	wobble: number;
	size: number;
	popped: boolean;
}

/**
 * Pop! (age 2): Sprig blows bubbles, and they float up across the screen. Tap one and it pops: an animal
 * jumps out making its noise. From level 3 a sign says which animal to find ("pop the cows"), and from
 * level 5 which colour; the others still pop, quietly, but only those count. Nothing's ever wrong. When
 * enough have popped, the mascot cheers with confetti. Bubbles that float away come round again.
 */
export default function Pop({ level, onDone, onBack }: GameProps) {
	const total = at(TARGETS, level);
	const finding = level >= FIND_COLOUR ? "colour" : level >= FIND_ANIMAL ? "animal" : null;
	// What to find this play, and the animals this play's bubbles hold.
	const animals = useMemo(() => fresh("pop.animals", ANIMALS, 6, (a) => a.id), []);
	const wanted = useMemo(() => (finding === "colour" ? any(COLOURS) : finding === "animal" ? animals[0] : null), [finding, animals]);
	const [bubbles, setBubbles] = useState<Bubble[]>([]);
	const [got, setGot] = useState(0);
	const [missed, setMissed] = useState(0);
	const [finished, setFinished] = useState(false);
	const nextId = useRef(0);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	useEffect(() => () => timers.current.forEach(clearTimeout), []);

	/** A new bubble: one that counts about half the time while finding (always, before then). */
	function blow(): Bubble {
		const counts = !finding || Math.random() < TARGET_SHARE;
		const id = nextId.current++;
		const base = { id, to: 0.2 + Math.random() * 0.8, wobble: 0.6 + Math.random() * 0.8, size: 0.85 + Math.random() * 0.3, popped: false };
		if (finding === "colour") return { ...base, colour: counts ? (wanted as Colour) : any(COLOURS.filter((c) => c !== wanted)) };
		if (finding === "animal") return { ...base, animal: counts ? (wanted as Animal) : any(animals.slice(1)) };
		return { ...base, animal: any(animals) };
	}

	// Sprig keeps blowing: a new bubble every so often, up to a few at once, until it's done.
	useEffect(() => {
		if (finished) return;
		const first = setTimeout(() => setBubbles([blow()]), 400);
		const more = setInterval(() => setBubbles((all) => (all.filter((b) => !b.popped).length < at(AT_ONCE, level) ? [...all, blow()] : all)), at(EVERY, level));
		return () => {
			clearTimeout(first);
			clearInterval(more);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [finished, level]);

	const counts = (b: Bubble) => !finding || (finding === "colour" ? b.colour === wanted : b.animal === wanted);

	function pop(b: Bubble) {
		if (b.popped || finished) return;
		setBubbles((all) => all.map((x) => (x.id === b.id ? { ...x, popped: true } : x)));
		// Gone once the pop's played.
		timers.current.push(setTimeout(() => setBubbles((all) => all.filter((x) => x.id !== b.id)), 900));
		if (!counts(b)) {
			setMissed((n) => n + 1);
			return;
		}
		if (b.animal) noise(b.animal);
		const now = got + 1;
		setGot(now);
		if (now >= total) {
			setFinished(true);
			// Every pop that counted, less the ones that didn't, is how many went right first time.
			timers.current.push(setTimeout(() => onDone(total, Math.max(0, total - missed)), CHEER_MS + 900));
		}
	}

	return (
		<Board onBack={onBack} total={total} done={got} cheer={finished}>
			{(box) => {
				// Big for little fingers (biggest at the first levels).
				const size = Math.max(84, Math.min(180, Math.min(box.w, box.h) * (level <= 2 ? 0.28 : 0.24)));
				return (
					<div className={s.popSky}>
						{/* What to find, on a sign at the top. */}
						{wanted && (
							<div className={s.popSign} aria-label={finding === "colour" ? `Pop the ${(wanted as Colour).name} ones` : `Pop the ${(wanted as Animal).name}s`}>
								<span className={s.popSignWord}>Pop</span>
								{finding === "colour"
									? <span className={s.popSwatch} style={{ background: (wanted as Colour).fill }} />
									: <span className={s.popSignPic}><Pic id={(wanted as Animal).id} /></span>}
							</div>
						)}
						{/* Sprig, blowing them, at the bottom. */}
						<img className={s.popSprig} src="/pop/sprig.webp" alt="" draggable={false} style={{ height: Math.min(box.h * 0.38, 260) }} />
						{bubbles.map((b) => (
							<button key={b.id} type="button" className={`${s.bubble} ${b.popped ? s.bubblePopped : ""}`}
								aria-label={b.animal ? `A bubble with a ${b.animal.name}` : `A ${b.colour!.name} bubble`}
								style={{
									"--size": `${size * b.size}px`, "--to": `${b.to * (box.w - size)}px`, "--rise": `${box.h + size}px`,
									"--time": `${at(RISE, level)}ms`, "--wobble": `${b.wobble * 2.4}s`,
								} as CSSProperties}
								onPointerDown={() => pop(b)} onClick={(e) => e.detail === 0 && pop(b)}
								onAnimationEnd={(e) => {
									// Floated away without a pop: gone (another one's on its way).
									if (e.animationName.includes("floatAway")) setBubbles((all) => all.filter((x) => x.id !== b.id));
								}}>
								<span className={s.bubbleWobble}>
									{b.colour && <span className={s.bubbleFill} style={{ background: b.colour.fill }} />}
									{b.animal && <span className={s.bubbleAnimal}><Pic id={b.animal.id} /></span>}
									<img className={s.bubbleRing} src="/pop/bubble.webp" alt="" draggable={false} />
								</span>
							</button>
						))}
					</div>
				);
			}}
		</Board>
	);
}
