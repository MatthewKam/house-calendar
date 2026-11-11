import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board, fit } from "./parts";
import { TOYS } from "./things";
import { at, between, CHEER_MS, fresh, shuffle, type GameProps, useLater } from "./rounds";
import s from "../../styles/Learn.module.css";
import g from "../../styles/LearnFindIt.module.css";

/** Kinds of thing in the room, the most of each, how many hide under others, and rooms a play, by level. */
const KINDS = [2, 2, 3, 3, 4, 4];
const MOST = [2, 3, 3, 3, 4, 4];
const HIDDEN = [0, 0, 1, 2, 2, 3];
const ROUNDS = [1, 1, 1, 2, 2, 2];

/** Different rooms each play. */
const ROOMS = [
	{ name: "bedroom", wall: "#dbe9ff", floor: "#c9a77c", rug: "#f2a2b0" },
	{ name: "playroom", wall: "#fff1c9", floor: "#b8d4a0", rug: "#8fc4f0" },
	{ name: "kitchen", wall: "#e3f4e1", floor: "#e8d9c0", rug: "#f6cf3c" },
	{ name: "living room", wall: "#f3e1f5", floor: "#c7b29a", rug: "#a5d6a7" },
];

/** A thing in the room: what it is, where it sits in its spot, its tilt, and what's hiding under it. */
interface Thing { id: number; kind: string; jx: number; jy: number; tilt: number; under: Thing | null }

/** A room's things: a few kinds, one to a few of each, laid out at random, some tucked under others. */
function roomFor(level: number) {
	const kinds = fresh("findit.kinds", TOYS, at(KINDS, level), (t) => t.id).map((t) => ({ ...t, count: between(1, at(MOST, level)) }));
	let id = 0;
	const all: Thing[] = shuffle(kinds.flatMap((k) => Array.from({ length: k.count }, () => k.id))).map((kind) => ({
		id: id++, kind, jx: Math.random() - 0.5, jy: Math.random() - 0.5, tilt: between(-12, 12), under: null,
	}));
	// Some hide under others (never under one of their own kind).
	const hidden = Math.min(at(HIDDEN, level), Math.floor(all.length / 2));
	const shown = [...all];
	for (let h = 0; h < hidden; h++) {
		const thing = shown.pop()!;
		const cover = shown.find((t) => !t.under && t.kind !== thing.kind);
		if (cover) cover.under = thing;
		else shown.push(thing);
	}
	return { kinds, shown, total: all.length };
}

/**
 * Find it! (ages 1 to 3): a room with a few kinds of things in it. The index at the top shows each kind
 * and how many there are; tap any of them and it flies to its place beside the index, and its number
 * goes down. Nothing's wrong to tap. From level 3 some are hiding under others: collect the teddy and
 * there's the sock. The room's done when everything's collected.
 */
export default function FindIt({ level, onDone, onBack }: GameProps) {
	const total = at(ROUNDS, level);
	const look = useMemo(() => fresh("findit.rooms", ROOMS, 1, (r) => r.name)[0], []);
	const [round, setRound] = useState(0);
	const room = useMemo(() => roomFor(level), [level, round]); // eslint-disable-line react-hooks/exhaustive-deps
	// What's been collected (by thing), and which have landed by the index after their flight.
	const [found, setFound] = useState<Thing[]>([]);
	const [landed, setLanded] = useState<number[]>([]);
	const [flying, setFlying] = useState<{ thing: Thing; dx: number; dy: number; scale: number; from: DOMRect }[]>([]);
	const [cheering, setCheering] = useState(false);
	const slots = useRef<Record<string, HTMLSpanElement | null>>({});
	const later = useLater();

	useEffect(() => {
		setFound([]);
		setLanded([]);
		setFlying([]);
		setCheering(false);
	}, [room]);

	function collect(thing: Thing, from: HTMLElement) {
		if (found.some((f) => f.id === thing.id)) return;
		const now = [...found, thing];
		setFound(now);
		// Off it flies to the next place in its kind's row.
		const place = now.filter((f) => f.kind === thing.kind).length - 1;
		const start = from.getBoundingClientRect();
		const end = slots.current[`${thing.kind}-${place}`]?.getBoundingClientRect();
		if (end) {
			setFlying((f) => [...f, {
				thing, from: start, scale: end.width / start.width,
				dx: end.left + end.width / 2 - (start.left + start.width / 2), dy: end.top + end.height / 2 - (start.top + start.height / 2),
			}]);
		} else setLanded((l) => [...l, thing.id]);
		// Everything collected: the cheer, then the next room (or the end).
		if (now.length === room.total) {
			later(() => setCheering(true), 700);
			later(() => (round + 1 >= total ? onDone(total, total) : setRound(round + 1)), 700 + CHEER_MS);
		}
	}

	return (
		<Board onBack={onBack} total={total} done={round + (cheering ? 1 : 0)} cheer={cheering}>
			{(box) => {
				const wide = box.w > box.h * 1.1;
				// The index: beside the room on its side, above it upright.
				const chip = Math.min(64, Math.max(40, (wide ? box.h / room.kinds.length - 20 : box.h * 0.08)));
				const indexW = wide ? chip * (1.9 + at(MOST, level) * 0.75) + 24 : box.w;
				const perRow = wide ? 1 : Math.max(1, Math.floor(box.w / (chip * (1.9 + at(MOST, level) * 0.75) + 16)));
				const indexH = wide ? box.h : Math.ceil(room.kinds.length / perRow) * (chip + 14);
				const area = wide ? { w: box.w - indexW - 12, h: box.h } : { w: box.w, h: box.h - indexH - 12 };
				// The wall's the top quarter; things are on the floor, in a loose grid, as big as fits.
				const floor = { w: area.w - 16, h: area.h * 0.75 - 12 };
				const grid = fit(room.shown.length, floor, { gap: 6, most: 200 });
				const cellW = floor.w / grid.cols;
				const cellH = floor.h / grid.rows;
				const size = Math.min(cellW, cellH) * 0.86;
				const gone = (t: Thing) => found.some((f) => f.id === t.id);
				return (
					<div className={wide ? s.row : s.column}>
						{/* The index: each kind, how many are left, and those collected lined up beside it. */}
						<div className={g.findIndex} style={{ width: wide ? indexW : undefined, flexDirection: wide ? "column" : "row" }}>
							{room.kinds.map((k) => {
								const left = k.count - found.filter((f) => f.kind === k.id).length;
								return (
									<span key={k.id} className={`${g.indexCard} ${left === 0 ? g.indexDone : ""}`} aria-label={`${k.many}: ${left} more`}>
										<span className={g.indexPic} style={{ width: chip, height: chip }}><Pic id={k.id} /></span>
										<span key={left} className={`${g.indexCount} ${left < k.count ? s.pop : ""}`} style={{ fontSize: chip * 0.7 }}>{left}</span>
										<span className={g.indexTray}>
											{Array.from({ length: k.count }, (_, i) => {
												const here = found.filter((f) => f.kind === k.id)[i];
												return (
													<span key={i} ref={(el) => { slots.current[`${k.id}-${i}`] = el; }} className={g.traySlot} style={{ width: chip * 0.62, height: chip * 0.62 }}>
														{here && landed.includes(here.id) && <span className={s.pop}><Pic id={k.id} /></span>}
													</span>
												);
											})}
										</span>
									</span>
								);
							})}
						</div>
						{/* On their way to the index. */}
						{flying.filter((f) => !landed.includes(f.thing.id)).map((f) => (
							<span key={f.thing.id} className={g.flyer} onAnimationEnd={() => setLanded((l) => [...l, f.thing.id])}
								style={{ left: f.from.left, top: f.from.top, width: f.from.width, height: f.from.height,
									"--dx": `${f.dx}px`, "--dy": `${f.dy}px`, "--s": f.scale } as CSSProperties}>
								<Pic id={f.thing.kind} />
							</span>
						))}
						<div className={g.room} style={{ width: area.w, height: area.h }}>
							<Room look={look} />
							{room.shown.map((t, i) => {
								const col = i % grid.cols;
								const row = Math.floor(i / grid.cols);
								const left = 8 + (col + 0.5) * cellW + t.jx * (cellW - size) - size / 2;
								const top = area.h * 0.25 + 4 + (row + 0.5) * cellH + t.jy * (cellH - size) - size / 2;
								return (
									<div key={`${round}-${t.id}`} className={g.spot} style={{ left, top, width: size, height: size }}>
										{/* What was hiding under it, there once it's been collected. */}
										{t.under && (
											<button type="button" onClick={(e) => collect(t.under!, e.currentTarget)} disabled={!gone(t)}
												aria-label={TOYS.find((x) => x.id === t.under!.kind)?.one} aria-hidden={!gone(t)}
												className={`${s.thing} ${gone(t.under) ? g.thingGone : ""}`} style={{ "--tilt": `${t.under.tilt}deg` } as CSSProperties}>
												<Pic id={t.under.kind} />
											</button>
										)}
										<button type="button" onClick={(e) => collect(t, e.currentTarget)}
											className={`${s.thing} ${gone(t) ? g.thingGone : ""}`} style={{ "--tilt": `${t.tilt}deg` } as CSSProperties}
											aria-label={TOYS.find((x) => x.id === t.kind)?.one}>
											<Pic id={t.kind} />
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
