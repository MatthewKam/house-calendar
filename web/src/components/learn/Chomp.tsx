import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Board, Over } from "./parts";
import { fresh } from "./rounds";
import s from "../../styles/Learn.module.css";

/** The two players, taking turns. */
const PLAYERS = [
	{ name: "Player 1", color: "#3d7bd9" },
	{ name: "Player 2", color: "#e8590c" },
];

/** How long a chomp lasts: the snap, then the laugh, then Play again? (ms). */
const SNAP = 450;
const LAUGH = 1400;

/** The art (web/public/chomp): each animal open (no teeth) and shut, in the same frame; the teeth. */
const ART = "/chomp";
/** Each tooth picture's width ÷ height (each one points up). */
const TOOTH_SHAPE: Record<string, number> = {
	crocodile: 138 / 220, shark: 220 / 214, dinosaur: 103 / 220, molar: 220 / 156, incisor: 173 / 220, canine: 85 / 220, tusk: 111 / 220,
};
/** Teeth that curve one way: on the right side they're mirrored, so both sides curve in. */
const CURVED = new Set(["dinosaur", "canine", "tusk"]);

/** A row of teeth: along a line on the inside of a lip (points as percents of the frame, left to right),
    which tooth each one is, and how tall (a fraction of the frame's width). */
interface Row {
	line: [number, number][];
	teeth: string[];
	size: number;
	/** How far in from each end of the line the first and last teeth sit (a fraction of its length). */
	inset?: number;
}

interface Animal {
	id: string;
	name: string;
	/** The pictures' frame (px). */
	frame: [number, number];
	/** Hanging from the top lip (just for show). */
	top: Row;
	/** Standing on the bottom lip: the ones to press. */
	bottom: Row;
}

const many = (n: number, tooth: string) => Array.from({ length: n }, () => tooth);

const ANIMALS: Animal[] = [
	{
		id: "crocodile", name: "Crocodile", frame: [1000, 833],
		top: { line: [[22, 34], [30, 37], [40, 40.5], [50, 44], [60, 40.5], [70, 37], [78, 34]], teeth: many(8, "crocodile"), size: 0.075 },
		bottom: { line: [[24, 44], [27, 58], [32, 66], [40, 71], [50, 73], [60, 71], [68, 66], [73, 58], [76, 44]], teeth: many(8, "crocodile"), size: 0.085 },
	},
	{
		id: "alligator", name: "Alligator", frame: [1000, 914],
		top: { line: [[13, 37], [25, 40], [37, 40], [50, 39.5], [63, 40], [75, 40], [87, 37]], teeth: many(10, "crocodile"), size: 0.075 },
		bottom: { line: [[13, 42], [17, 52], [24, 60], [33, 66], [42, 69], [50, 70], [58, 69], [67, 66], [76, 60], [83, 52], [87, 42]], teeth: many(8, "crocodile"), size: 0.09 },
	},
	{
		id: "shark", name: "Shark", frame: [1000, 914],
		top: { line: [[19, 47], [30, 45], [40, 43.5], [50, 43], [60, 43.5], [70, 45], [80, 47]], teeth: many(9, "shark"), size: 0.065 },
		bottom: { line: [[19, 52], [21, 62], [26, 70], [33, 75], [42, 78], [50, 78.5], [58, 78], [67, 75], [74, 70], [79, 62], [81, 52]], teeth: many(8, "shark"), size: 0.075 },
	},
	{
		id: "dinosaur", name: "Dinosaur", frame: [1000, 914],
		top: { line: [[24, 34], [35, 32], [50, 31.5], [65, 32], [76, 34]], teeth: many(8, "crocodile"), size: 0.075 },
		bottom: { line: [[24, 40], [25, 52], [29, 60], [36, 65], [44, 67], [50, 67.5], [56, 67], [64, 65], [71, 60], [75, 52], [76, 40]], teeth: many(8, "crocodile"), size: 0.085 },
	},
	{
		id: "hippo", name: "Hippo", frame: [962, 1000],
		// Big square front teeth on top, and its tusks at the bottom, with little square ones around them.
		top: { line: [[15, 45], [25, 43], [38, 42], [50, 41.5], [62, 42], [75, 43], [85, 45]], teeth: ["molar", "molar", "incisor", "incisor", "molar", "molar"], size: 0.07, inset: 0.12 },
		bottom: { line: [[14, 52], [16, 63], [22, 71], [32, 75.5], [42, 77], [50, 77.5], [58, 77], [68, 75.5], [78, 71], [84, 63], [86, 52]], teeth: ["molar", "tusk", "incisor", "incisor", "incisor", "tusk", "molar"], size: 0.08, inset: 0.14 },
	},
	{
		id: "lion", name: "Lion", frame: [1000, 914],
		// Little front teeth, and big fangs at the corners, top and bottom.
		top: { line: [[20, 41], [30, 39], [40, 38], [50, 37.5], [60, 38], [70, 39], [80, 41]], teeth: ["canine", "incisor", "incisor", "incisor", "incisor", "incisor", "incisor", "canine"], size: 0.06 },
		bottom: { line: [[20, 46], [22, 56], [28, 63], [36, 66.5], [44, 68], [50, 68], [56, 68], [64, 66.5], [72, 63], [78, 56], [80, 46]], teeth: ["canine", "incisor", "incisor", "incisor", "incisor", "canine"], size: 0.075, inset: 0.2 },
	},
];

/** How much bigger a fang (a canine or tusk) is than the teeth beside it. */
const FANG = 1.7;

/** Where each tooth in a row goes: spaced evenly along its line, standing on it, pointing into the mouth. */
function place(row: Row, frame: [number, number], down: boolean) {
	const [fw, fh] = frame;
	const pts = row.line.map(([x, y]) => [(x / 100) * fw, (y / 100) * fh]);
	const lengths = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
	const total = lengths.reduce((a, b) => a + b, 0);
	const inset = row.inset ?? 0.06;
	const n = row.teeth.length;
	const gap = (total * (1 - 2 * inset)) / Math.max(1, n - 1);
	return row.teeth.map((kind, i) => {
		// How far along the line, then which piece of it that's on.
		let along = total * inset + gap * i;
		let k = 0;
		while (k < lengths.length - 1 && along > lengths[k]) along -= lengths[k++];
		const [x0, y0] = pts[k];
		const [x1, y1] = pts[k + 1];
		const f = Math.min(1, along / lengths[k]);
		const dx = (x1 - x0) / lengths[k];
		const dy = (y1 - y0) / lengths[k];
		// Into the mouth: up from the bottom lip, down from the top one.
		const [nx, ny] = down ? [-dy, dx] : [dy, -dx];
		const fang = kind === "canine" || kind === "tusk";
		let h = fw * row.size * (fang ? FANG : 1);
		// Not wider than the room it has (fangs can crowd a little).
		const w0 = h * TOOTH_SHAPE[kind];
		if (!fang && w0 > gap * 0.95) h *= (gap * 0.95) / w0;
		const left = x0 + (x1 - x0) * f < fw / 2;
		return {
			// The base, a little into the lip.
			x: x0 + (x1 - x0) * f - nx * h * 0.12,
			y: y0 + (y1 - y0) * f - ny * h * 0.12,
			h, w: h * TOOTH_SHAPE[kind], kind, gap,
			angle: (Math.atan2(nx, -ny) * 180) / Math.PI,
			flip: CURVED.has(kind) && !left,
		};
	});
}

/** A tooth, its base at (0, 0), pointing up. */
function Tooth({ t }: { t: ReturnType<typeof place>[number] }) {
	return <image href={`${ART}/tooth-${t.kind}.webp`} x={-t.w / 2} y={-t.h} width={t.w} height={t.h} transform={t.flip ? "scale(-1 1)" : undefined} />;
}

/** Chomp!'s picture on its card (and any animal's, mouth open, all its teeth in). */
export function ChompPic({ className, animal = "crocodile" }: { className?: string; animal?: string }) {
	const a = ANIMALS.find((x) => x.id === animal) ?? ANIMALS[0];
	const [fw, fh] = a.frame;
	return (
		<svg className={className} viewBox={`0 0 ${fw} ${fh}`} aria-hidden="true">
			<image href={`${ART}/${a.id}-open.webp`} width={fw} height={fh} />
			{[...place(a.top, a.frame, true), ...place(a.bottom, a.frame, false)].map((t, i) => (
				<g key={i} transform={`translate(${t.x} ${t.y}) rotate(${t.angle})`}><Tooth t={t} /></g>
			))}
		</svg>
	);
}

/**
 * Chomp! (a game for two, a toddler and a sibling or grown-up): a big animal, its mouth shut until
 * Ready! opens it. Take turns pressing a tooth down; one of them makes the mouth snap shut, a surprise,
 * never a loss: the animal laughs, and that's the game. Then a pop-up: play again (a new animal), or back
 * to the games.
 */
export default function Chomp({ onAgain, onBack }: { onAgain: () => void; onBack: () => void }) {
	const players = PLAYERS;
	const animal = useMemo(() => fresh("chomp.animals", ANIMALS, 1, (a) => a.id)[0], []);
	const [pressed, setPressed] = useState<number[]>([]);
	const [chompTooth] = useState(() => Math.floor(Math.random() * animal.bottom.teeth.length));
	const [turn, setTurn] = useState(() => Math.floor(Math.random() * players.length));
	const [chomped, setChomped] = useState<number | null>(null);
	const [laughing, setLaughing] = useState(false);
	const [over, setOver] = useState(false);
	// The mouth starts shut, with Ready! to open it.
	const [open, setOpen] = useState(false);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
	useEffect(() => () => timers.current.forEach(clearTimeout), []);
	const closed = !open || chomped !== null;
	const top = useMemo(() => place(animal.top, animal.frame, true), [animal]);
	const teeth = useMemo(() => place(animal.bottom, animal.frame, false), [animal]);
	// The burst comes up only after a while: have it ready.
	useEffect(() => {
		new Image().src = `${ART}/chomp.webp`;
	}, []);

	function press(i: number) {
		if (closed || pressed.includes(i)) return;
		setPressed([...pressed, i]);
		if (i !== chompTooth) {
			setTurn((t) => (t + 1) % players.length);
			return;
		}
		// Chomp! The mouth snaps shut on whoever's turn it was; a laugh; then Play again?
		setChomped(turn);
		later(() => setLaughing(true), SNAP);
		later(() => setOver(true), SNAP + LAUGH);
	}

	return (
		<Board onBack={onBack}>
			{(box) => {
				const tagSize = Math.min(64, Math.max(44, box.h * 0.08));
				const [fw, fh] = animal.frame;
				// A wide, short screen (a phone on its side): the players either side of the head, so it gets the
				// whole height; otherwise above it.
				const sides = box.w > box.h * 1.6;
				const width = sides ? Math.min(box.w - 2 * (tagSize * 3 + 16), box.h * (fw / fh)) : Math.min(box.w, (box.h - tagSize - 24) * (fw / fh));
				// Whose turn: each player's name in their color; the one up is big and bright. Who just got chomped
				// bounces.
				const tag = (i: number) => (
					<span key={i} className={`${s.chompTag} ${i === turn && !closed ? s.chompUp : ""} ${chomped === i ? s.chompGot : ""}`}
						style={{ "--pc": players[i].color, fontSize: tagSize * 0.42 } as CSSProperties}>
						{players[i].name}
					</span>
				);
				return (
					<div className={sides ? s.chompSides : s.column}>
						{sides ? tag(0) : <div className={s.chompPlayers} style={{ height: tagSize }}>{players.map((_, i) => tag(i))}</div>}
						<div className={s.chompStage} style={{ width }}>
							<svg className={`${s.chompHead} ${laughing ? s.chompLaugh : ""}`} viewBox={`0 0 ${fw} ${fh}`}
								role="img" aria-label={`${animal.name}, mouth ${closed ? "shut" : "open"}`}>
								{/* Open and shut, both there so the snap doesn't wait for a picture to load. */}
								<image href={`${ART}/${animal.id}-open.webp`} width={fw} height={fh} opacity={closed ? 0 : 1} />
								<image href={`${ART}/${animal.id}-shut.webp`} width={fw} height={fh} opacity={closed ? 1 : 0} />
								{/* The teeth (only while it's open): the top row's just for show; the bottom row's to press. */}
								<g className={closed ? s.teethHidden : undefined}>
									{top.map((t, i) => (
										<g key={i} transform={`translate(${t.x} ${t.y}) rotate(${t.angle})`}><Tooth t={t} /></g>
									))}
									{teeth.map((t, i) => {
										const down = pressed.includes(i);
										return (
											<g key={i} transform={`translate(${t.x} ${t.y}) rotate(${t.angle})`} role="button" tabIndex={closed ? -1 : 0}
												aria-label={`Tooth ${i + 1}${down ? ", pressed" : ""}`} onClick={() => press(i)}
												onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && press(i)}>
												{/* A big invisible target, easier for little fingers than the tooth itself. */}
												<rect x={-Math.max(t.gap, t.w) / 2} y={-t.h * 1.4} width={Math.max(t.gap, t.w)} height={t.h * 1.7} fill="transparent" />
												<g className={`${s.tooth} ${down ? s.toothDown : ""}`}><Tooth t={t} /></g>
											</g>
										);
									})}
								</g>
							</svg>
							{/* Ready? Opens the mouth to start. */}
							{!open && (
								<button type="button" className={`${s.chompReady} ${s.pop}`} onClick={() => setOpen(true)}>
									<img src={`${ART}/ready.webp`} alt="Ready!" />
								</button>
							)}
							{/* Chomp! */}
							{chomped !== null && <img className={s.chompBurst} src={`${ART}/chomp.webp`} alt="Chomp!" />}
						</div>
						{sides && tag(1)}
						{over && <Over title="Chomp!" onAgain={onAgain} onBack={onBack} />}
					</div>
				);
			}}
		</Board>
	);
}
