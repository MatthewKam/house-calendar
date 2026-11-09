import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board } from "./parts";
import { ANIMALS, type Animal } from "./things";
import { any, at, CHEER_MS, fresh, type GameProps } from "./rounds";
import s from "../../styles/Learn.module.css";

/**
 * Each level: what counts (any bubble; one with an animal in; the animal on the sign; the colour on the
 * sign), how many to pop, how often a new bubble's one that counts, the most up at once, a new one every
 * so often (ms), and how long one takes to float away (ms). Every play starts with a burst of bubbles.
 */
type Find = "any" | "anyAnimal" | "animal" | "colour";
const LEVELS: { find: Find; total: number; share: number; most: number; every: number; rise: number }[] = [
	{ find: "any", total: 12, share: 1, most: 8, every: 700, rise: 9000 },
	{ find: "anyAnimal", total: 8, share: 0.55, most: 6, every: 800, rise: 8500 },
	{ find: "animal", total: 6, share: 0.4, most: 6, every: 800, rise: 8000 },
	{ find: "colour", total: 8, share: 0.4, most: 6, every: 800, rise: 8000 },
	{ find: "animal", total: 8, share: 0.35, most: 7, every: 650, rise: 7000 },
	{ find: "colour", total: 10, share: 0.35, most: 8, every: 600, rise: 6500 },
];
/** Bubbles at the start, a moment apart, before the steady stream. */
const BURST = 7;
const BURST_GAP = 180;

const COLOURS = [
	{ id: "red", name: "red", fill: "#ff5a5a" },
	{ id: "blue", name: "blue", fill: "#4a90ff" },
	{ id: "yellow", name: "yellow", fill: "#ffd23a" },
	{ id: "green", name: "green", fill: "#4cc76a" },
	{ id: "purple", name: "purple", fill: "#a66bff" },
] as const;
type Colour = (typeof COLOURS)[number];

/** A bubble: what's in it (an animal, a colour, or nothing), where it floats, and whether it's been popped. */
interface Bubble {
	id: number;
	animal?: Animal;
	colour?: Colour;
	/** Across the screen from Sprig's wand: where it ends up (0–1 of the width), and its wobble. */
	to: number;
	wobble: number;
	size: number;
	/** How far along its way it starts (ms): the opening burst's are already spread across the sky. */
	head: number;
	popped: boolean;
}

/**
 * Pop! (age 2): Sprig blows bubbles (a burst to start, then a steady stream), and they float up across the
 * screen. Tap one and it pops. Level 1: just bubbles, any of them. Level 2: the ones with an animal in
 * (it jumps out). Level 3 and 5: the animal on the sign ("pop the cows"), others mixed in.
 * Level 4 and 6: the colour on the sign. The others still pop, quietly, but only those count; nothing's
 * ever wrong. When enough have popped, the mascot cheers with confetti. Bubbles that float away come round
 * again.
 */
export default function Pop({ level, onDone, onBack }: GameProps) {
	const rules = at(LEVELS, level);
	const { total, find } = rules;
	// What to find this play, and the animals this play's bubbles hold.
	const animals = useMemo(() => fresh("pop.animals", ANIMALS, 6, (a) => a.id), []);
	const wanted = useMemo(() => (find === "colour" ? any(COLOURS) : find === "animal" ? animals[0] : null), [find, animals]);
	const [bubbles, setBubbles] = useState<Bubble[]>([]);
	const [got, setGot] = useState(0);
	const [missed, setMissed] = useState(0);
	const [finished, setFinished] = useState(false);
	const nextId = useRef(0);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	useEffect(() => () => timers.current.forEach(clearTimeout), []);

	/** A new bubble: one that counts some of the time (share), else one that doesn't (empty, another animal, another colour). */
	function blow(head = 0): Bubble {
		const counts = Math.random() < rules.share;
		const id = nextId.current++;
		const base = { id, to: 0.2 + Math.random() * 0.8, wobble: 0.6 + Math.random() * 0.8, size: 0.85 + Math.random() * 0.3, head, popped: false };
		if (find === "colour") return { ...base, colour: counts ? (wanted as Colour) : any(COLOURS.filter((c) => c !== wanted)) };
		if (find === "animal") {
			// Not the one: mostly another animal, sometimes just a bubble.
			return counts ? { ...base, animal: wanted as Animal } : Math.random() < 0.7 ? { ...base, animal: any(animals.slice(1)) } : base;
		}
		if (find === "anyAnimal") return counts ? { ...base, animal: any(animals) } : base;
		return base;
	}

	// Sprig blows a burst to start, then keeps blowing: a new bubble every so often, up to a few at once.
	useEffect(() => {
		if (finished) return;
		const burst = Array.from({ length: BURST }, (_, i) =>
			setTimeout(() => setBubbles((all) => [...all, blow(rules.rise * (0.3 + Math.random() * 0.15))]), 300 + i * BURST_GAP));
		const more = setInterval(() => setBubbles((all) => (all.filter((b) => !b.popped).length < rules.most ? [...all, blow()] : all)), rules.every);
		return () => {
			burst.forEach(clearTimeout);
			clearInterval(more);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [finished, level]);

	const counts = (b: Bubble) =>
		find === "any" || (find === "anyAnimal" ? !!b.animal : find === "colour" ? b.colour === wanted : b.animal === wanted);

	function pop(b: Bubble) {
		if (b.popped || finished) return;
		setBubbles((all) => all.map((x) => (x.id === b.id ? { ...x, popped: true } : x)));
		// Gone once the pop's played.
		timers.current.push(setTimeout(() => setBubbles((all) => all.filter((x) => x.id !== b.id)), 900));
		if (!counts(b)) {
			setMissed((n) => n + 1);
			return;
		}
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
							<div className={s.popSign} aria-label={find === "colour" ? `Pop the ${(wanted as Colour).name} ones` : `Pop the ${(wanted as Animal).name}s`}>
								<span className={s.popSignWord}>Pop</span>
								{find === "colour"
									? <span className={s.popSwatch} style={{ background: (wanted as Colour).fill }} />
									: <span className={s.popSignPic}><Pic id={(wanted as Animal).id} /></span>}
							</div>
						)}
						{/* Sprig, blowing them, at the bottom. */}
						<img className={s.popSprig} src="/pop/sprig.webp" alt="" draggable={false} style={{ height: Math.min(box.h * 0.38, 260) }} />
						{bubbles.map((b) => (
							<button key={b.id} type="button" className={`${s.bubble} ${b.popped ? s.bubblePopped : ""}`}
								aria-label={b.animal ? `A bubble with a ${b.animal.name}` : b.colour ? `A ${b.colour.name} bubble` : "A bubble"}
								style={{
									"--size": `${size * b.size}px`, "--to": `${b.to * (box.w - size)}px`, "--rise": `${box.h + size}px`,
									"--time": `${rules.rise}ms`, "--wobble": `${b.wobble * 2.4}s`, animationDelay: `-${b.head}ms`,
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
