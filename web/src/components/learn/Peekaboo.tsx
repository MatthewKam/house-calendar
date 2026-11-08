import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board, fit } from "./parts";
import { ANIMALS, type Animal } from "./things";
import { at, CHEER_MS, fresh, type GameProps } from "./rounds";
import { noise } from "./sound";
import s from "../../styles/Learn.module.css";

/** Bushes, and animals hiding in them over a play, by level. */
const BUSHES = [3, 4, 4, 5, 5, 6];
const ANIMALS_PER_PLAY = [8, 10, 10, 12, 12, 14];
/** How long an animal stays out after its noise before ducking back down (ms; a couple of seconds at least). */
const STAY_AFTER = 1200;
const STAY_AT_LEAST = 2500;

/** Different skies each play: day, morning, sunset. */
const SKIES = [
	{ sky: "#cfe9ff", hill: "#a6dc8a", light: "#ffd95a" },
	{ sky: "#ffe3c4", hill: "#9fd28a", light: "#ffb347" },
	{ sky: "#ffd1dc", hill: "#8cc98a", light: "#ff8c69" },
	{ sky: "#d9f2e6", hill: "#b5e08a", light: "#fff07a" },
];

/** Where the animals hide each play, and the scene around them: a different one each time. */
const PLACES = [
	{ id: "bush", scene: "farm", name: "bush" },
	{ id: "haystack", scene: "barnyard", name: "haystack" },
	{ id: "tractor", scene: "field", name: "tractor" },
	{ id: "window", scene: "barn", name: "window" },
] as const;
type Scene = (typeof PLACES)[number]["scene"];

/** A bush (or haystack, tractor, window): who's hiding in it now, whether they're out, and how many times it's been tapped (for its rustle). */
interface Bush { animal: Animal | null; out: boolean; taps: number }

/**
 * Peekaboo farm (age 2): not a game to win, just fun. Tap a bush (or a haystack, a tractor, a barn
 * window: a different place and scene each play) and an animal pops up, its name in front, making its
 * noise (tap it again to hear it again). A couple of seconds after, it ducks back down and someone new
 * is hiding there. When every animal's had its turn, the mascot cheers with confetti and that's the
 * end. A new set of animals each play.
 */
export default function Peekaboo({ level, onDone, onBack }: GameProps) {
	const look = useMemo(() => fresh("peekaboo.skies", SKIES, 1, (x) => x.sky)[0], []);
	const place = useMemo(() => fresh("peekaboo.places", PLACES, 1, (p) => p.id)[0], []);
	// A window's animal looks out of it; anywhere else, it pops up over the top.
	const inside = place.id === "window";
	const bushCount = at(BUSHES, level);
	// Everyone hiding this play, in the order they'll turn up.
	const queue = useMemo(() => fresh("peekaboo.animals", ANIMALS, Math.max(bushCount, at(ANIMALS_PER_PLAY, level)), (a) => a.id), [level, bushCount]);
	const next = useRef(bushCount);
	const [bushes, setBushes] = useState<Bush[]>(() => queue.slice(0, bushCount).map((animal) => ({ animal, out: false, taps: 0 })));
	// Everyone's had their turn: the cheer, then the end.
	const [finished, setFinished] = useState(false);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
	useEffect(() => () => timers.current.forEach(clearTimeout), []);
	// Each bush's own "duck back down" timer, so tapping it again keeps it out a bit longer.
	const hideTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
	useEffect(() => () => Object.values(hideTimers.current).forEach(clearTimeout), []);

	// Once nobody's left hiding or out: the mascot and confetti, then the end.
	useEffect(() => {
		if (finished || bushes.some((b) => b.animal)) return;
		later(() => setFinished(true), 400);
		later(() => onDone(1, 1), 400 + CHEER_MS + 600);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bushes]);

	function tap(i: number) {
		const bush = bushes[i];
		if (finished || !bush.animal) return;
		const animal = bush.animal;
		setBushes((all) => all.map((b, j) => (j === i ? { ...b, out: true, taps: b.taps + 1 } : b)));
		clearTimeout(hideTimers.current[i]);
		const from = Date.now();
		noise(animal, () => {
			hideTimers.current[i] = setTimeout(() => {
				// Back down, and someone new hides there (or nobody, once everyone's had a turn).
				const newcomer = next.current < queue.length ? queue[next.current++] : null;
				setBushes((all) => all.map((b, j) => (j === i ? { ...b, animal: newcomer, out: false } : b)));
			}, Math.max(STAY_AFTER, STAY_AT_LEAST - (Date.now() - from)));
		});
	}

	return (
		<Board onBack={onBack} cheer={finished}>
			{(box) => {
				// Each bush has room above it for its animal to pop all the way up.
				const shape = inside ? 0.85 : 0.62;
				// On a tablet (either way up) or a phone on its side, the hiding places in one row; on an upright
				// phone, the grid that fits best.
				const room = { w: box.w - 24, h: box.h * (inside ? 0.8 : 0.66) };
				const grid = box.w > box.h || box.w >= 600
					? { cols: bushes.length, size: Math.floor(Math.min((room.w - 12 * (bushes.length - 1)) / bushes.length, room.h * shape, 240)) }
					: fit(bushes.length, room, { gap: 12, shape, most: 240 });
				return (
					<div className={s.farm} style={{ "--sky": look.sky, "--hill": look.hill, "--light": look.light } as CSSProperties}>
						<Scenery scene={place.scene} />
						<div className={`${s.bushes} ${inside ? s.windows : ""}`} style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.size}px)` }}>
							{bushes.map((b, i) => (
								// With nobody left to hide there, it sinks away (and can't be tapped).
								<button key={i} type="button" className={`${s.bushSpot} ${b.animal ? "" : s.gone}`} onClick={() => tap(i)}
									disabled={!b.animal}
									style={{ width: grid.size, height: grid.size / shape }}
									aria-hidden={!b.animal}
									aria-label={b.out && b.animal ? `${b.animal.name}: tap to hear it again` : `A ${place.name}. Who's hiding?`}>
									{/* A window: the room behind it, dark until someone looks out. */}
									{inside && <span className={s.room} style={{ left: grid.size * 0.25, top: grid.size * 0.25, width: grid.size * 0.5, height: grid.size * 0.57 }} />}
									{b.out && b.animal && (
										<span key={`${b.animal.id}-${b.taps}`} className={`${inside ? s.lookOut : s.peeker} ${s.peek}`}
											style={inside ? { left: grid.size * 0.27, top: grid.size * 0.3, width: grid.size * 0.46 } : undefined}>
											<Pic id={b.animal.id} />
										</span>
									)}
									<span key={`b${b.taps}`} className={`${s.bush} ${b.taps && !inside ? s.rustle : ""}`}>
										<Pic id={place.id} />
									</span>
									{b.out && b.animal && <span className={s.bushName}>{b.animal.name}</span>}
								</button>
							))}
						</div>
					</div>
				);
			}}
		</Board>
	);
}

/** The scene behind the hiding places: the sky (sun and clouds), then the place. */
function Scenery({ scene }: { scene: Scene }) {
	return (
		<svg className={s.farmBack} viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
			<rect width="1000" height="600" style={{ fill: "var(--sky)" }} />
			<circle cx="860" cy="90" r="50" style={{ fill: "var(--light)" }} />
			<g fill="#fff" opacity=".9">
				<ellipse cx="200" cy="90" rx="70" ry="26" />
				<ellipse cx="250" cy="72" rx="50" ry="30" />
				<ellipse cx="560" cy="130" rx="60" ry="22" />
				<ellipse cx="600" cy="116" rx="40" ry="24" />
			</g>
			{scene === "farm" && (
				<>
					<path d="M0 300 C200 240 420 290 600 270 C780 250 900 240 1000 255 V600 H0z" style={{ fill: "var(--hill)" }} opacity=".75" />
					<Barn x={700} y={150} />
					<path d="M0 340 C250 310 700 330 1000 320 V600 H0z" style={{ fill: "var(--hill)" }} />
					<Fence y={330} />
				</>
			)}
			{scene === "barnyard" && (
				<>
					<path d="M0 300 C200 260 500 290 1000 270 V600 H0z" style={{ fill: "var(--hill)" }} opacity=".75" />
					<Barn x={40} y={110} big />
					<path d="M0 360 C300 340 700 350 1000 340 V600 H0z" fill="#e3cf8e" />
					<Fence y={350} />
				</>
			)}
			{scene === "field" && (
				<>
					<path d="M0 290 C250 250 600 280 1000 260 V600 H0z" style={{ fill: "var(--hill)" }} />
					{/* Rows of crops, running back to the hills. */}
					<g stroke="#5e9a3a" strokeWidth="10" strokeLinecap="round" opacity=".55">
						{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${500 + (i - 4) * 40} 290 L${500 + (i - 4) * 260} 600`} />)}
					</g>
				</>
			)}
			{scene === "barn" && (
				<>
					{/* The side of a red barn: boards, and its roof's edge at the top. */}
					<rect y="150" width="1000" height="450" fill="#c84a3c" />
					<g stroke="#a8322a" strokeWidth="5">
						{Array.from({ length: 20 }, (_, i) => <path key={i} d={`M${i * 52 + 20} 150 V600`} />)}
					</g>
					<path d="M0 150 H1000 V176 H0z" fill="#7a2620" />
				</>
			)}
		</svg>
	);
}

/** A red barn, at x, y (`big`: closer, filling more of the scene). */
function Barn({ x, y, big }: { x: number; y: number; big?: boolean }) {
	return (
		<g transform={`translate(${x} ${y}) scale(${big ? 1.25 : 1})`}>
			<path d="M0 90 L120 20 L240 90z" fill="#a8322a" />
			<rect x="12" y="88" width="216" height="150" fill="#d0473b" />
			<rect x="90" y="150" width="60" height="88" fill="#f4f1ec" />
			<path d="M90 150 L150 238 M150 150 L90 238" stroke="#d0473b" strokeWidth="7" />
			<rect x="100" y="104" width="40" height="30" fill="#f4f1ec" />
		</g>
	);
}

/** A white fence across the scene at y. */
function Fence({ y }: { y: number }) {
	return (
		<g stroke="#f4f1ec" strokeWidth="9" strokeLinecap="round">
			<path d={`M0 ${y + 20} H1000 M0 ${y + 50} H1000`} />
			{Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${i * 100 + 20} ${y} V${y + 70}`} />)}
		</g>
	);
}
