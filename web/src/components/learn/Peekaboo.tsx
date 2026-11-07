import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board, fit } from "./parts";
import { ANIMALS, type Animal } from "./things";
import { at, fresh, type GameProps } from "./rounds";
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
const NIGHT = { sky: "#26305e", hill: "#3f6b4a", light: "#f4f1ec" };

/** A bush: who's hiding in it now, whether they're out, and how many times it's been tapped (for its rustle). */
interface Bush { animal: Animal | null; out: boolean; taps: number }

/**
 * Peekaboo farm (age 2): not a game to win, just fun. Tap a bush and an animal pops up, its name in
 * front of the bush, making its noise (tap it again to hear it again). A couple of seconds after, it
 * ducks back down and someone new is hiding there. When every animal's had its turn, night falls and
 * that's the end. A new set of animals each play.
 */
export default function Peekaboo({ level, onDone, onBack }: GameProps) {
	const look = useMemo(() => fresh("peekaboo.skies", SKIES, 1, (x) => x.sky)[0], []);
	const bushCount = at(BUSHES, level);
	// Everyone hiding this play, in the order they'll turn up.
	const queue = useMemo(() => fresh("peekaboo.animals", ANIMALS, Math.max(bushCount, at(ANIMALS_PER_PLAY, level)), (a) => a.id), [level, bushCount]);
	const next = useRef(bushCount);
	const [bushes, setBushes] = useState<Bush[]>(() => queue.slice(0, bushCount).map((animal) => ({ animal, out: false, taps: 0 })));
	const [night, setNight] = useState(false);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
	useEffect(() => () => timers.current.forEach(clearTimeout), []);
	// Each bush's own "duck back down" timer, so tapping it again keeps it out a bit longer.
	const hideTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
	useEffect(() => () => Object.values(hideTimers.current).forEach(clearTimeout), []);

	// Once nobody's left hiding or out: night, then the end.
	useEffect(() => {
		if (night || bushes.some((b) => b.animal)) return;
		later(() => setNight(true), 600);
		later(() => onDone(1, 1), 3600);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bushes]);

	function tap(i: number) {
		const bush = bushes[i];
		if (night || !bush.animal) return;
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

	const colors = night ? NIGHT : look;
	return (
		<Board onBack={onBack}>
			{(box) => {
				// Each bush has room above it for its animal to pop all the way up.
				const grid = fit(bushes.length, { w: box.w - 24, h: box.h * 0.66 }, { gap: 12, shape: 0.62, most: 240 });
				return (
					<div className={s.farm} style={{ "--sky": colors.sky, "--hill": colors.hill, "--light": colors.light } as CSSProperties}>
						<Farm night={night} />
						<div className={s.bushes} style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.size}px)` }}>
							{bushes.map((b, i) => (
								<button key={i} type="button" className={s.bushSpot} onClick={() => tap(i)}
									style={{ width: grid.size, height: grid.size / 0.62 }}
									aria-label={b.out && b.animal ? `${b.animal.name}: tap to hear it again` : b.animal ? "A bush. Who's hiding?" : "A bush"}>
									{b.out && b.animal && (
										<span key={`${b.animal.id}-${b.taps}`} className={`${s.peeker} ${s.peek}`}>
											<Pic id={b.animal.id} />
										</span>
									)}
									<span key={`b${b.taps}`} className={`${s.bush} ${b.taps ? s.rustle : ""}`}>
										<Pic id="bush" />
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

/** The farm behind the bushes: sun or moon, clouds, hills, the barn and a fence. */
function Farm({ night }: { night: boolean }) {
	return (
		<svg className={s.farmBack} viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
			<rect width="1000" height="600" style={{ fill: "var(--sky)" }} />
			<circle cx="860" cy="90" r="50" style={{ fill: "var(--light)" }} />
			{!night && (
				<g fill="#fff" opacity=".9">
					<ellipse cx="200" cy="90" rx="70" ry="26" />
					<ellipse cx="250" cy="72" rx="50" ry="30" />
					<ellipse cx="560" cy="130" rx="60" ry="22" />
					<ellipse cx="600" cy="116" rx="40" ry="24" />
				</g>
			)}
			{night && (
				<g fill="#fff">
					<circle cx="120" cy="60" r="3" />
					<circle cx="300" cy="120" r="2.5" />
					<circle cx="480" cy="50" r="3" />
					<circle cx="650" cy="150" r="2" />
					<circle cx="740" cy="40" r="2.5" />
				</g>
			)}
			<path d="M0 300 C200 240 420 290 600 270 C780 250 900 240 1000 255 V600 H0z" style={{ fill: "var(--hill)" }} opacity=".75" />
			<g transform="translate(700 150)">
				<path d="M0 90 L120 20 L240 90z" fill="#a8322a" />
				<rect x="12" y="88" width="216" height="150" fill="#d0473b" />
				<rect x="90" y="150" width="60" height="88" fill="#f4f1ec" />
				<path d="M90 150 L150 238 M150 150 L90 238" stroke="#d0473b" strokeWidth="7" />
				<rect x="100" y="104" width="40" height="30" fill="#f4f1ec" />
			</g>
			<path d="M0 340 C250 310 700 330 1000 320 V600 H0z" style={{ fill: "var(--hill)" }} />
			<g stroke="#f4f1ec" strokeWidth="9" strokeLinecap="round">
				<path d="M0 350 H1000 M0 380 H1000" />
				{Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${i * 100 + 20} 330 V400`} />)}
			</g>
		</svg>
	);
}
