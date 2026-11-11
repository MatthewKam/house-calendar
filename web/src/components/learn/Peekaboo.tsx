import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board } from "./parts";
import { ANIMALS, type Animal } from "./things";
import { at, CHEER_MS, fresh, shuffle, type GameProps, useLater } from "./rounds";
import { noise } from "./sound";
import s from "../../styles/Learn.module.css";
import g from "../../styles/LearnPeekaboo.module.css";

/** Hiding places (always three: the garden's three pots), and animals hiding in them over a play, by level. */
const BUSHES = [3];
const ANIMALS_PER_PLAY = [8, 10, 10, 12, 12, 14];
/** How long an animal stays out after its noise before ducking back down (ms; a couple of seconds at least). */
const STAY_AFTER = 1200;
const STAY_AT_LEAST = 2500;

/**
 * Where the animals hide each play (a different one each time): its painted scene, and the hiding place
 * in front of it. The garden's three pots are all different, in a new order each play. `wide`: the
 * hiding place's width over its height; `peek`: how far up it the animal sits (behind it, so the rest is
 * hidden), as a share of its height.
 */
const PLACES = [
	{ id: "farm", name: "haystack", spots: ["haystack"], wide: 560 / 333, peek: 0.55 },
	{ id: "field", name: "tractor", spots: ["tractor"], wide: 560 / 381, peek: 0.5 },
	{ id: "forest", name: "bush", spots: ["bush"], wide: 560 / 308, peek: 0.5 },
	{ id: "garden", name: "flower pot", spots: ["pot-1", "pot-2", "pot-3"], wide: 420 / 390, peek: 0.62 },
	{ id: "safari", name: "rock", spots: ["boulder"], wide: 560 / 252, peek: 0.45 },
] as const;
const art = (file: string) => `/hide/${file}.webp`;

/**
 * A hiding place (a haystack, a tractor, a bush, a flower pot, a rock): who's hiding in it now, whether they're out, how many times it's
 * been tapped (for its rustle), and `last`: it's out for good, with nobody new left to hide there.
 */
interface Bush { animal: Animal | null; out: boolean; taps: number; last?: boolean }

/**
 * Peekaboo (age 2): not a game to win, just fun. Tap a haystack on the farm (or a tractor in the
 * field, a bush in the forest, a flower pot in the garden, a rock on the safari: a different scene each
 * play) and an animal pops up, its name in front, making its
 * noise (tap it again to hear it again). A couple of seconds after, it ducks back down and someone new
 * is hiding there; once nobody new is left, the last one there stays up. When every animal's had its
 * turn, the mascot cheers with confetti and that's the end. A new set of animals each play.
 */
export default function Peekaboo({ level, onDone, onBack }: GameProps) {
	const place = useMemo(() => fresh("peekaboo.places", PLACES, 1, (p) => p.id)[0], []);
	// Each hiding place's picture: the garden's pots in a new order each play (round again past three).
	const spots = useMemo(() => shuffle(place.spots), [place]);
	const bushCount = at(BUSHES, level);
	// Everyone hiding this play, in the order they'll turn up.
	const queue = useMemo(() => fresh("peekaboo.animals", ANIMALS, Math.max(bushCount, at(ANIMALS_PER_PLAY, level)), (a) => a.id), [level, bushCount]);
	const next = useRef(bushCount);
	const [bushes, setBushes] = useState<Bush[]>(() => queue.slice(0, bushCount).map((animal) => ({ animal, out: false, taps: 0 })));
	// Everyone's had their turn: the cheer, then the end.
	const [finished, setFinished] = useState(false);
	const later = useLater();
	// Each bush's own "duck back down" timer, so tapping it again keeps it out a bit longer.
	const hideTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
	useEffect(() => () => Object.values(hideTimers.current).forEach(clearTimeout), []);

	// Once nobody's left to hide and every last one is up: the mascot and confetti, then the end.
	useEffect(() => {
		if (finished || next.current < queue.length || bushes.some((b) => b.animal && !b.last)) return;
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
			// With nobody new left to hide there, this one stays up.
			if (next.current >= queue.length) {
				setBushes((all) => all.map((b, j) => (j === i ? { ...b, last: true } : b)));
				return;
			}
			hideTimers.current[i] = setTimeout(() => {
				// Back down, and someone new hides there (if nobody's taken the last one meanwhile).
				if (next.current >= queue.length) {
					setBushes((all) => all.map((b, j) => (j === i ? { ...b, last: true } : b)));
					return;
				}
				const newcomer = queue[next.current++];
				setBushes((all) => all.map((b, j) => (j === i ? { ...b, animal: newcomer, out: false } : b)));
			}, Math.max(STAY_AFTER, STAY_AT_LEAST - (Date.now() - from)));
		});
	}

	return (
		<Board onBack={onBack} cheer={finished}>
			{(box) => {
				// Each hiding place has room above it for its animal to pop all the way up: the animal is as wide
				// as most of it, and stands from `peek` of the way up.
				const animalShare = 0.6;
				const shape = 1 / (place.peek / place.wide + animalShare);
				// On a tablet (either way up) or a phone on its side, the three in one row; on an upright phone, two
				// and one under them (whatever the hiding place's shape).
				// On a tablet, up off the bottom: a quarter of the way up on its side, nearer the middle upright
				// (a phone keeps them on the ground at the bottom).
				const tablet = box.w >= 600 && box.h >= 500;
				const lift = !tablet ? 0 : box.w > box.h ? box.h * 0.25 : box.h * 0.3;
				const room = { w: box.w - 24, h: Math.min(box.h * 0.7, box.h - lift - 24) };
				const row = box.w > box.h || box.w >= 600;
				const cols = row ? bushes.length : 2;
				const rows = Math.ceil(bushes.length / cols);
				const grid = { cols, size: Math.floor(Math.min((room.w - 12 * (cols - 1)) / cols, ((room.h - 12 * (rows - 1)) / rows) * shape, 260)) };
				const placeHeight = grid.size / place.wide;
				return (
					<div className={g.farm}>
						<img className={s.farmBack} src={art(place.id)} alt="" draggable={false} />
						<div className={g.bushes} style={{ maxWidth: grid.cols * grid.size + (grid.cols - 1) * 12 + 24, marginBottom: lift }}>
							{bushes.map((b, i) => (
								<button key={i} type="button" className={g.bushSpot} onClick={() => tap(i)}
									style={{ width: grid.size, height: grid.size / shape }}
									aria-label={b.out && b.animal ? `${b.animal.name}: tap to hear it again` : `A ${place.name}. Who's hiding?`}>
									{/* Out: it jumps up from behind (its feet over the top of the hiding place, whose height
									    is known from its picture's shape), and lands in front, on the grass. Tapped again: a hop. */}
									{b.out && b.animal && (
										<span key={b.animal.id} className={g.jumper}
											style={{ width: grid.size * animalShare, "--behind": `${placeHeight * place.peek}px`, "--over": `${placeHeight + grid.size * 0.06}px` } as CSSProperties}>
											<span key={b.taps} className={b.taps > 1 ? s.hop : ""}>
												<Pic id={b.animal.id} />
											</span>
										</span>
									)}
									<span key={`b${b.taps}`} className={`${g.bush} ${b.taps ? s.rustle : ""}`}>
										<img src={art(spots[i % spots.length])} alt="" draggable={false} />
									</span>
									{b.out && b.animal && <span className={g.bushName}>{b.animal.name}</span>}
								</button>
							))}
						</div>
					</div>
				);
			}}
		</Board>
	);
}
