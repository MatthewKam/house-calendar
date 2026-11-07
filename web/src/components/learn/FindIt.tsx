import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board, fit } from "./parts";
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

interface Spot { kind: string; jx: number; jy: number; tilt: number; under: string | null }

/** A round's things, in a random order (laid out in a grid on the floor), some of what's to find tucked under others. */
function roomFor(level: number, find: string) {
	const n = at(THINGS, level);
	const want = at(FIND, level);
	const hidden = Math.min(at(HIDDEN, level), want);
	const others = TOYS.map((t) => t.id).filter((id) => id !== find);
	// Visible things: what's to find (minus what's hidden), then others to make up the room.
	const visible = [...Array(want - hidden).fill(find), ...Array.from({ length: n - (want - hidden) }, () => any(others))];
	const spots: Spot[] = shuffle(visible).map((kind) => ({
		kind, jx: Math.random() - 0.5, jy: Math.random() - 0.5, tilt: between(-12, 12), under: null,
	}));
	// Hide the rest under other things.
	shuffle(spots.filter((p) => p.kind !== find)).slice(0, hidden).forEach((p) => (p.under = find));
	return spots;
}

/**
 * Find it! (age 2): a room full of toys. Find the 2 socks, then the 3 teddy bears. Each one found hops
 * and fills in its outline at the top (the outlines show what to find). From level 3 some are hiding
 * under other things: tap the teddy and it lifts, and there's the sock. Anything else just wiggles.
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
		<Board onBack={onBack} total={total} done={round + (found.length === want ? 1 : 0)} cheer={found.length === want}>
			{(box) => {
				const goalSize = Math.min(64, Math.max(40, box.h * 0.09));
				const room = { w: box.w, h: box.h - goalSize - 12 };
				// The wall's the top quarter; things are on the floor, in a loose grid, as big as fits.
				const floor = { w: room.w - 16, h: room.h * 0.75 - 12 };
				const grid = fit(spots.length, floor, { gap: 6, most: 200 });
				const cellW = floor.w / grid.cols;
				const cellH = floor.h / grid.rows;
				const size = Math.min(cellW, cellH) * 0.86;
				return (
					<div className={s.column}>
						<div className={s.goal} aria-label={`${found.length} of ${want} found`}>
							{Array.from({ length: want }, (_, i) => (
								<span key={i} className={`${s.goalOne} ${i < found.length ? `${s.goalGot} ${s.pop}` : ""}`} style={{ width: goalSize, height: goalSize }}>
									<Pic id={find.id} />
								</span>
							))}
						</div>
						<div className={s.room} style={{ width: room.w, height: room.h }}>
							<Room look={look} />
							{spots.map((p, i) => {
								const up = lifted.includes(i);
								const col = i % grid.cols;
								const row = Math.floor(i / grid.cols);
								const left = 8 + (col + 0.5) * cellW + p.jx * (cellW - size) - size / 2;
								const top = room.h * 0.25 + 4 + (row + 0.5) * cellH + p.jy * (cellH - size) - size / 2;
								const underKey = keyOf(i, true);
								const ownKey = keyOf(i, false);
								return (
									<div key={`${round}-${i}`} className={s.spot} style={{ left, top, width: size, height: size }}>
										{p.under && up && (
											<button type="button" key={`u${tapped?.i === underKey ? tapped.n : 0}`} onClick={() => tap(i, true)} aria-label={find.one}
												className={`${s.thing} ${found.includes(underKey) ? s.thingGot : ""} ${tapped?.i === underKey ? s.hop : ""}`}>
												<Pic id={p.under} />
											</button>
										)}
										<button type="button" key={`k${tapped?.i === ownKey ? tapped.n : 0}`}
											className={`${s.thing} ${up ? s.lifted : ""} ${found.includes(ownKey) ? s.thingGot : ""} ${tapped?.i === ownKey ? (p.kind === find.id ? s.hop : s.wiggle) : ""}`}
											style={{ "--tilt": `${p.tilt}deg` } as CSSProperties}
											onClick={() => tap(i, false)} aria-label={TOYS.find((t) => t.id === p.kind)?.one}>
											<Pic id={p.kind} />
										</button>
									</div>
								);
							})}
						</div>
					</div>
				);
			}}
		</Board>
	);
}

/** The room behind the toys: its wall with a window and a shelf, its floor and rug, and a bit of furniture. */
function Room({ look }: { look: (typeof ROOMS)[number] }) {
	return (
		<svg className={s.roomBack} viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
			<rect width="1000" height="150" fill={look.wall} />
			<rect y="150" width="1000" height="450" fill={look.floor} />
			<rect y="146" width="1000" height="10" fill="#fff" opacity=".7" />
			<ellipse cx="500" cy="420" rx="360" ry="130" fill={look.rug} opacity=".8" />
			{/* A window with sky, and a shelf. */}
			<rect x="90" y="22" width="150" height="104" rx="8" fill="#fff" />
			<rect x="100" y="32" width="130" height="84" fill="#bfe3ff" />
			<path d="M165 32 V116 M100 74 H230" stroke="#fff" strokeWidth="6" />
			<rect x="400" y="96" width="200" height="10" rx="4" fill="#b48a4c" />
			<rect x="420" y="66" width="22" height="30" fill="#e8707c" />
			<rect x="446" y="58" width="18" height="38" fill="#5aa0e6" />
			<rect x="468" y="70" width="24" height="26" fill="#f6cf3c" />
			<circle cx="560" cy="80" r="16" fill="#5cb85c" />
			{look.name === "bedroom" && <path d="M760 150 V70 Q760 56 776 56 H930 Q946 56 946 70 V150z" fill="#7a5cc8" opacity=".85" />}
			{look.name === "living room" && <path d="M740 150 V92 Q740 76 756 76 H944 Q960 76 960 92 V150z" fill="#e8707c" opacity=".85" />}
			{look.name === "kitchen" && <rect x="740" y="70" width="220" height="80" fill="#fff" opacity=".85" />}
			{look.name === "playroom" && <rect x="770" y="80" width="170" height="70" rx="8" fill="#f4a020" opacity=".85" />}
		</svg>
	);
}
