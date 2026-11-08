import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Board } from "./parts";
import { fresh } from "./rounds";
import s from "../../styles/Learn.module.css";

/** The two players, taking turns. */
const PLAYERS = [
	{ name: "Player 1", color: "#3d7bd9" },
	{ name: "Player 2", color: "#e8590c" },
];

/** A chomp (ms): the snap, then the laugh; then, a few seconds on, the grin and Ready! for another go. */
const SNAP = 450;
const PAUSE = 3500;

/** The art (web/public/chomp): Ready!, the Chomp! burst, and a folder for each animal. */
const ART = "/chomp";

interface Animal {
	id: string;
	name: string;
	/** The pictures' frame (px): the open mouth (its top teeth drawn in) and the shut one. */
	frame: [number, number];
	/** The bottom teeth, each its own picture (bottom-1.png, … left to right): where each sits in the
	    frame (x, y, width, height). These are the ones to press. */
	teeth: [number, number, number, number][];
}

/** The animals (more to come, each drawn the same way). */
const ANIMALS: Animal[] = [
	{
		id: "shark", name: "Shark", frame: [1000, 914],
		teeth: [
			[258.4, 528.2, 44.2, 73.2], [272.1, 582.3, 57.9, 81.6], [299.5, 636.4, 64, 93], [343.8, 682.9, 65.5, 98.3], [406.3, 704.3, 87.7, 106.7],
			[513, 703.5, 86.1, 107.5], [598.3, 682.9, 63.3, 96.8], [644.8, 635.7, 59.5, 91.5], [673.8, 583.1, 54.1, 80], [695.9, 529, 43.4, 72.4],
		],
	},
];

/** How long the nudge to tap a bottom tooth stays up (ms). */
const HINT = 1800;

/** How far past a tooth a tap still counts, so little fingers needn't be exact (frame px). Where two
    teeth are both that close, the nearer one gets it. */
const REACH = 18;

/** Chomp!'s picture on its card: the shark, mouth open, all its teeth in. */
export function ChompPic({ className }: { className?: string }) {
	const a = ANIMALS[0];
	const [fw, fh] = a.frame;
	return (
		<svg className={className} viewBox={`0 0 ${fw} ${fh}`} aria-hidden="true">
			<image href={`${ART}/${a.id}/open.webp`} width={fw} height={fh} />
			{a.teeth.map(([x, y, w, h], i) => <image key={i} href={`${ART}/${a.id}/bottom-${i + 1}.png`} x={x} y={y} width={w} height={h} />)}
		</svg>
	);
}

/**
 * Chomp! (a game for two, a toddler and a sibling or grown-up): a big animal grinning, Ready! to open its
 * mouth wide. Take turns pressing a bottom tooth (each shakes and goes); one of them makes the mouth snap
 * shut: Chomp! The other player wins. A few seconds on, it grins again, Ready! for another go.
 */
export default function Chomp({ onBack }: { onBack: () => void }) {
	const players = PLAYERS;
	const animal = useMemo(() => fresh("chomp.animals", ANIMALS, 1, (a) => a.id)[0], []);
	const [pressed, setPressed] = useState<number[]>([]);
	const [chompTooth, setChompTooth] = useState(() => Math.floor(Math.random() * animal.teeth.length));
	// Player 1 starts the first game; then they take turns starting.
	const [starter, setStarter] = useState(0);
	const [turn, setTurn] = useState(0);
	// Who got chomped (the other one wins).
	const [chomped, setChomped] = useState<number | null>(null);
	const [laughing, setLaughing] = useState(false);
	// The mouth: grinning shut with Ready! to open it, open wide, or chomped.
	const [open, setOpen] = useState(false);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
	useEffect(() => () => timers.current.forEach(clearTimeout), []);
	const closed = !open || chomped !== null;
	const winner = chomped === null ? null : (chomped + 1) % players.length;
	// Who won the game before, shown under the grin until the next one's won.
	const [lastWinner, setLastWinner] = useState<number | null>(null);
	// A tap that missed the teeth: a nudge to tap a bottom one (a new number each time, so it starts over).
	const [hint, setHint] = useState(0);
	const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(hintTimer.current), []);
	function missed() {
		if (closed) return;
		setHint((n) => n + 1);
		clearTimeout(hintTimer.current);
		hintTimer.current = setTimeout(() => setHint(0), HINT);
	}
	// The chomped face and the burst come up only later: have them ready.
	useEffect(() => {
		new Image().src = `${ART}/chomp.webp`;
		new Image().src = `${ART}/${animal.id}/chomped.webp`;
	}, [animal]);

	// A tap on the mouth: the tooth nearest the finger, if one's close enough (otherwise it's a miss, and the
	// nudge).
	function tapMouth(e: MouseEvent<SVGSVGElement>) {
		if (closed) return;
		const svg = e.currentTarget;
		const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
		// Nearest: the least gap to the tooth's edge, then (on or between overlapping teeth) to its middle.
		let best = -1;
		let bestGap = REACH;
		let bestMiddle = Infinity;
		animal.teeth.forEach(([x, y, w, h], i) => {
			if (pressed.includes(i)) return;
			const gap = Math.hypot(Math.max(x - at.x, 0, at.x - (x + w)), Math.max(y - at.y, 0, at.y - (y + h)));
			const middle = Math.hypot(at.x - (x + w / 2), at.y - (y + h / 2));
			if (gap < bestGap || (gap === bestGap && middle < bestMiddle)) [best, bestGap, bestMiddle] = [i, gap, middle];
		});
		if (best < 0) return;
		e.stopPropagation();
		press(best);
	}

	function press(i: number) {
		if (closed || pressed.includes(i)) return;
		clearTimeout(hintTimer.current);
		setHint(0);
		setPressed([...pressed, i]);
		if (i !== chompTooth) {
			setTurn((t) => (t + 1) % players.length);
			return;
		}
		// Chomp! The mouth snaps shut on whoever's turn it was, and the other one wins; a laugh; then, a few
		// seconds on, it grins again, teeth back, Ready! for another go (the other player starts it).
		const got = turn;
		setChomped(got);
		setLastWinner((got + 1) % players.length);
		later(() => setLaughing(true), SNAP);
		later(() => {
			setLaughing(false);
			setChomped(null);
			setOpen(false);
			setPressed([]);
			setChompTooth(Math.floor(Math.random() * animal.teeth.length));
			const next = (starter + 1) % players.length;
			setStarter(next);
			setTurn(next);
		}, PAUSE);
	}

	return (
		<Board onBack={onBack}>
			{(box) => {
				const tagSize = Math.min(72, Math.max(48, box.h * 0.085));
				const [fw, fh] = animal.frame;
				// A wide, short screen (a phone on its side): the players either side of the head, so it gets the
				// whole height; otherwise above it.
				const sides = box.w > box.h * 1.6;
				// The tags' text: as big as fits two side by side (each about 8.5 of its letters wide), or one either
				// side of the head.
				const tagFont = Math.min(tagSize * 0.4, sides ? 22 : (box.w - 48) / 18);
				// Room under the head for who won.
				const stamp = 28;
				const width = sides
					? Math.min(box.w - 2 * (tagFont * 9 + 16), (box.h - stamp) * (fw / fh))
					: Math.min(box.w, (box.h - tagSize - 24 - stamp) * (fw / fh));
				// Each player: their number in a badge and their name, in their color. Whose turn it is lifts up,
				// lit in their color; the winner of a chomp bounces.
				const tag = (i: number) => (
					<span key={i} className={`${s.chompTag} ${(i === turn && !closed) || i === winner ? s.chompUp : ""} ${i === winner ? s.chompWin : ""}`}
						style={{ "--pc": players[i].color, fontSize: tagFont } as CSSProperties}>
						<span className={s.chompBadge}>{i + 1}</span>
						{players[i].name}
					</span>
				);
				return (
					// Anywhere but a tooth (while the mouth's open): the nudge.
					<div className={sides ? s.chompSides : s.column} onClick={missed}>
						{sides ? tag(0) : <div className={s.chompPlayers} style={{ height: tagSize }}>{players.map((_, i) => tag(i))}</div>}
						<div className={s.chompStage} style={{ width }}>
							<svg className={`${s.chompHead} ${laughing ? s.chompLaugh : ""}`} viewBox={`0 0 ${fw} ${fh}`}
								role="img" aria-label={`${animal.name}, mouth ${closed ? "shut" : "open"}`} onClick={tapMouth}>
								{/* Grinning, open wide, and chomped, all there so the snap doesn't wait for a picture. */}
								<image href={`${ART}/${animal.id}/shut.webp`} width={fw} height={fh} opacity={!open ? 1 : 0} />
								<image href={`${ART}/${animal.id}/open.webp`} width={fw} height={fh} opacity={open && chomped === null ? 1 : 0} />
								<image href={`${ART}/${animal.id}/chomped.webp`} width={fw} height={fh} opacity={open && chomped !== null ? 1 : 0} />
								{/* The bottom teeth, to press (only while it's open; the top ones are in the picture). */}
								{/* (Two nudges, taking turns, so each miss starts the pulse over.) */}
								<g className={closed ? s.teethHidden : hint ? (hint % 2 ? s.teethNudge : s.teethNudgeAgain) : undefined}>
									{animal.teeth.map(([x, y, w, h], i) => {
										const down = pressed.includes(i);
										return (
											<g key={i} className={s.toothHit} role="button" tabIndex={closed ? -1 : 0}
												aria-label={`Tooth ${i + 1}${down ? ", pressed" : ""}`}
												onClick={(e) => {
													// A finger's tap goes to the nearest tooth (above); this is for a click with no
													// pointer, like a screen reader's.
													if (e.detail !== 0 || down) return;
													e.stopPropagation();
													press(i);
												}}
												onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && press(i)}>
												<image className={`${s.tooth} ${down ? s.toothDown : ""}`} href={`${ART}/${animal.id}/bottom-${i + 1}.png`}
													x={x} y={y} width={w} height={h} />
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
							{/* Missed the teeth: which ones to tap (for a grown-up to read; the teeth pulse for the kids). */}
							{hint > 0 && <p key={hint} className={s.chompHint} role="status">Tap a bottom tooth!</p>}
							{/* Waiting for Ready!: who won the last game, along the bottom. */}
							{!open && lastWinner !== null && (
								<p className={s.chompLast} style={{ "--pc": players[lastWinner].color } as CSSProperties}>
									Last game: <span className={s.chompBadge}>{lastWinner + 1}</span> {players[lastWinner].name} won
								</p>
							)}
							{/* Chomp! And who won, stamped under it. */}
							{winner !== null && (
								<>
									<img className={s.chompBurst} src={`${ART}/chomp.webp`} alt="Chomp!" />
									<p className={s.chompStamp} style={{ "--pc": players[winner].color } as CSSProperties} role="status">
										{players[winner].name} wins!
									</p>
								</>
							)}
						</div>
						{sides && tag(1)}
					</div>
				);
			}}
		</Board>
	);
}
