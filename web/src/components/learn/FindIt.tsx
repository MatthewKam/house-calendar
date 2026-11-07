import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board } from "./parts";
import { TOYS } from "./things";
import { any, at, between, pick, shuffle, type GameProps } from "./rounds";
import s from "../../styles/Learn.module.css";

/** Things in the room, how many to find, and how many of those hide under something, by level. */
const THINGS = [6, 8, 10, 12, 14, 16];
const FIND = [2, 2, 3, 3, 4, 5];
const HIDDEN = [0, 0, 1, 1, 2, 3];
const ROUNDS = [2, 2, 3, 3, 3, 3];
/** Taps on the wrong thing (with nothing under it) a round can have and still be first try. */
const SLIPS = 2;

/** Different rooms each play. */
const ROOMS = [
	{ name: "bedroom", wall: "#dbe9ff", floor: "#c9a77c", rug: "#f2a2b0" },
	{ name: "playroom", wall: "#fff1c9", floor: "#b8d4a0", rug: "#8fc4f0" },
	{ name: "kitchen", wall: "#e3f4e1", floor: "#e8d9c0", rug: "#f6cf3c" },
	{ name: "living room", wall: "#f3e1f5", floor: "#c7b29a", rug: "#a5d6a7" },
];

interface Spot { kind: string; x: number; y: number; tilt: number; under: string | null }

/** A round's room: things at spots on a loose grid, some of what's to find tucked under others. */
function roomFor(level: number, find: string) {
	const n = at(THINGS, level);
	const want = at(FIND, level);
	const hidden = Math.min(at(HIDDEN, level), want);
	const others = TOYS.map((t) => t.id).filter((id) => id !== find);
	const cols = n <= 8 ? 4 : n <= 12 ? 5 : 6;
	const rows = Math.ceil(n / cols);
	// Visible things: what's to find (minus what's hidden), then others to make up the room.
	const visible = [...Array(want - hidden).fill(find), ...Array.from({ length: n - (want - hidden) }, () => any(others))];
	const spots: Spot[] = shuffle(visible).map((kind, i) => ({
		kind,
		x: ((i % cols) + 0.5 + (Math.random() - 0.5) * 0.4) / cols,
		y: (Math.floor(i / cols) + 0.55 + (Math.random() - 0.5) * 0.3) / rows,
		tilt: between(-12, 12),
		under: null,
	}));
	// Hide the rest under other things.
	shuffle(spots.filter((p) => p.kind !== find)).slice(0, hidden).forEach((p) => (p.under = find));
	return spots;
}

/**
 * Find it! (age 2): a room full of toys. Find the 2 socks, then the 3 teddy bears. Each one found hops
 * and fills in its outline at the top (the outlines show what to find) From level 3 some are hiding under other things:
 * tap the teddy and it lifts, and there's the sock. Anything else just wiggles.
 */
export default function FindIt({ level, onDone, onBack }: GameProps) {
	const total = at(ROUNDS, level);
	const look = useMemo(() => any(ROOMS), []);
	const finds = useMemo(() => pick(TOYS, total), [total]);
	const [round, setRound] = useState(0);
	const find = finds[round];
	const want = at(FIND, level);
	const spots = useMemo(() => roomFor(level, find.id), [level, find.id]);
	const [found, setFound] = useState<number[]>([]);
	const [lifted, setLifted] = useState<number[]>([]);
	const [tapped, setTapped] = useState<{ i: number; n: number } | null>(null);
	const [slips, setSlips] = useState(0);
	const [firstTry, setFirstTry] = useState(0);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	useEffect(() => () => timers.current.forEach(clearTimeout), []);

	useEffect(() => {
		setFound([]);
		setLifted([]);
		setTapped(null);
		setSlips(0);
	}, [spots]);

	// What's been found counts each thing once: a spot's own thing ("k"), or what was under it ("u").
	const keyOf = (i: number, underneath: boolean) => i * 2 + (underneath ? 1 : 0);
	function tap(i: number, underneath: boolean) {
		const p = spots[i];
		const kind = underneath ? p.under! : p.kind;
		setTapped((t) => ({ i: keyOf(i, underneath), n: (t?.n ?? 0) + 1 }));
		if (kind === find.id) {
			if (found.includes(keyOf(i, underneath))) return;
			const now = [...found, keyOf(i, underneath)];
			setFound(now);
			if (now.length === want) {
				const right = firstTry + (slips <= SLIPS ? 1 : 0);
				setFirstTry(right);
				timers.current.push(setTimeout(() => (round + 1 >= total ? onDone(total, right) : setRound(round + 1)), 2200));
			}
			return;
		}
		// Something with a thing under it lifts to show it; anything else wiggles.
		if (p.under && !lifted.includes(i)) {
			setLifted([...lifted, i]);
			return;
		}
		setSlips((n) => n + 1);
	}

	return (
		<Board onBack={onBack} total={total} done={round + (found.length === want ? 1 : 0)} className={s.scene}>
			<div className={s.findTop}>
				<div className={s.goal} aria-label={`${found.length} of ${want} found`}>
					{Array.from({ length: want }, (_, i) => (
						<span key={i} className={`${s.goalOne} ${i < found.length ? s.goalGot : ""}`}>
							<Pic id={find.id} />
						</span>
					))}
				</div>
			</div>
			<div className={s.room} style={{ "--wall": look.wall, "--floor": look.floor, "--rug": look.rug } as CSSProperties}>
				{spots.map((p, i) => {
					const up = lifted.includes(i);
					const style = { left: `${p.x * 100}%`, top: `${p.y * 100}%` } as CSSProperties;
					const underKey = keyOf(i, true);
					return (
						<div key={`${round}-${i}`} className={s.spot} style={style}>
							{p.under && up && (
								<button type="button" className={`${s.thing} ${found.includes(underKey) ? s.thingGot : ""} ${tapped?.i === underKey ? s.hop : ""}`}
									key={`u${tapped?.i === underKey ? tapped.n : 0}`} onClick={() => tap(i, true)} aria-label={find.one}>
									<Pic id={p.under} />
								</button>
							)}
							<button type="button" key={`k${tapped?.i === keyOf(i, false) ? tapped.n : 0}`}
								className={`${s.thing} ${up ? s.lifted : ""} ${found.includes(keyOf(i, false)) ? s.thingGot : ""} ${tapped?.i === keyOf(i, false) ? (p.kind === find.id ? s.hop : s.wiggle) : ""}`}
								style={{ "--tilt": `${p.tilt}deg` } as CSSProperties}
								onClick={() => tap(i, false)} aria-label={TOYS.find((t) => t.id === p.kind)?.one}>
								<Pic id={p.kind} />
							</button>
						</div>
					);
				})}
			</div>
		</Board>
	);
}
