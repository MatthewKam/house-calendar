import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
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
	/** The bottom teeth, each its own picture (bottom-1.png, …): where each sits in the
	    frame (x, y, width, height). These are the ones to press. */
	teeth: [number, number, number, number][];
}

/** The animals, one picked each time Chomp! starts (more to come, each drawn the same way). */
const ANIMALS: Animal[] = [
	{
		id: "shark", name: "Shark", frame: [1000, 914],
		teeth: [
			[258.4, 528.2, 44.2, 73.2], [272.1, 582.3, 57.9, 81.6], [299.5, 636.4, 64, 93], [343.8, 682.9, 65.5, 98.3], [406.3, 704.3, 87.7, 106.7],
			[513, 703.5, 86.1, 107.5], [598.3, 682.9, 63.3, 96.8], [644.8, 635.7, 59.5, 91.5], [673.8, 583.1, 54.1, 80], [695.9, 529, 43.4, 72.4],
		],
	},
	{
		id: "t-rex", name: "T-rex", frame: [1000, 892],
		teeth: [
			[308, 412.7, 42.2, 67.8], [319.3, 458.6, 49.7, 77.6], [338.1, 509.8, 56.5, 86.6], [372, 560.2, 60.2, 90.4], [426.2, 598.6, 67.8, 88.9],
			[509, 597.9, 67.8, 89.6], [570.8, 559.5, 60.2, 91.1], [607.7, 509, 56.5, 86.6], [632.5, 457.1, 50.5, 78.3], [652.1, 412.7, 42.2, 67.8],
		],
	},
	{
		// Its molars up each side, a tusk at each corner, and four little front teeth.
		id: "hippo", name: "Hippo", frame: [1000, 914],
		teeth: [
			[227.9, 580, 90.7, 80.8], [238.6, 526.7, 83.1, 65.5], [253, 479.4, 76.2, 61], [283.5, 590.7, 96.8, 159.3], [372.7, 693.6, 64, 69.4], [432.2, 698.2, 69.4, 70.1],
			[499.2, 698.2, 70.1, 70.1], [564.8, 692.8, 63.3, 69.4], [620.4, 590.7, 96.8, 159.3], [670.7, 479.4, 77, 60.2], [678.4, 526.7, 83.8, 65.5], [682.2, 580, 89.9, 80.8],
		],
	},
	{
		id: "alligator", name: "Alligator", frame: [1000, 962],
		teeth: [
			[257.4, 406.9, 54.8, 82.9], [263.7, 472.6, 61, 90], [282.5, 534.4, 63.4, 97.8], [320, 593.1, 68.1, 106.4], [402.2, 640.8, 73.6, 100.9],
			[519.6, 640.1, 73.6, 101.7], [605.6, 592.3, 68.9, 107.2], [649.5, 532.9, 62.6, 98.6], [670.6, 471, 59.5, 90.8], [683.9, 405.3, 50.9, 82.9],
		],
	},
	{
		// Three teeth up each side, a big fang at each corner, and four little front teeth.
		id: "lion", name: "Lion", frame: [1000, 1094],
		teeth: [
			[307.8, 551.3, 44.2, 61.7], [311.9, 595.5, 54.2, 71.7], [322.8, 645.5, 58.4, 80.9], [362, 695.6, 71.7, 128.4], [426.2, 782.3, 47.5, 45.9], [464.6, 785.7, 49.2, 46.7],
			[505.4, 784.8, 48.4, 47.5], [544.6, 780.7, 45.9, 46.7], [583, 695.6, 70.9, 128.4], [635.5, 644.7, 55, 80.9], [647.2, 594.7, 51.7, 71.7], [659.7, 552.1, 42.5, 60.9],
		],
	},
	{
		// Like the lion: three up each side, a fang at each corner, four little front teeth.
		id: "tiger", name: "Tiger", frame: [1000, 1094],
		teeth: [
			[291.1, 491.2, 45, 60.1], [297.7, 536.3, 55, 65.1], [308.6, 583, 59.2, 73.4], [352.8, 633, 75.1, 129.3], [420.4, 716.4, 45, 47.5], [456.2, 718.9, 43.4, 47.5],
			[490.4, 718.9, 44.2, 47.5], [525.4, 716.4, 44.2, 47.5], [563, 633, 74.2, 129.3], [622.2, 583, 56.7, 73.4], [634.7, 536.3, 52.5, 65.1], [650.5, 491.2, 43.4, 60.1],
		],
	},
	{
		id: "crocodile", name: "Crocodile", frame: [1000, 938],
		teeth: [
			[318.9, 387.6, 40.9, 59.5], [323.6, 432.4, 47.9, 70.3], [336.7, 483.4, 49.4, 73.4], [362.2, 526.6, 53.3, 79.5], [400, 565.3, 59.5, 84.2], [456.4, 596.9, 64.1, 84.9],
			[523.6, 596.9, 64.1, 84.9], [583.8, 565.3, 59.5, 84.2], [626.3, 526.6, 54.1, 79.5], [654.8, 483.4, 49.4, 73.4], [669.5, 432.4, 47.9, 69.5], [681.9, 387.6, 40.2, 59.5],
		],
	},
];

/** Which animal this time: a different one from last time. (Called once, when Chomp! is started.) */
export const pickAnimal = () => fresh("chomp.animals", ANIMALS, 1, (a) => a.id)[0].id;

/** How long the nudge to tap a bottom tooth stays up (ms). */
const HINT = 1800;

/** How far past a tooth a tap still counts, so little fingers needn't be exact (frame px). Where two
    teeth are both that close, the nearer one gets it. */
const REACH = 18;

/** Chomp!'s picture on its card (the shark, or another animal): mouth open, all its teeth in. */
export function ChompPic({ animal = "shark", className }: { animal?: string; className?: string }) {
	const a = ANIMALS.find((x) => x.id === animal) ?? ANIMALS[0];
	const [fw, fh] = a.frame;
	return (
		<svg className={className} viewBox={`0 0 ${fw} ${fh}`} aria-hidden="true">
			<image href={`${ART}/${a.id}/open.webp`} width={fw} height={fh} />
			{a.teeth.map(([x, y, w, h], i) => <image key={i} href={`${ART}/${a.id}/bottom-${i + 1}.png`} x={x} y={y} width={w} height={h} />)}
		</svg>
	);
}

/**
 * Chomp! (a game for two, a toddler and a sibling or grown-up): a big animal (a shark, a T-rex, a hippo, an
 * alligator, a lion, a tiger or a crocodile, a new one each game) grinning, Ready! to open its
 * mouth wide. Take turns pressing a bottom tooth (each shakes and goes); one of them makes the mouth snap
 * shut: Chomp! The other player wins. A few seconds on, it grins again, Ready! for another go.
 */
export default function Chomp({ animal: id, onBack }: { animal: string; onBack: () => void }) {
	const players = PLAYERS;
	// The animal: the one picked as Chomp! started, then a new one each game.
	const [animal, setAnimal] = useState(() => ANIMALS.find((a) => a.id === id) ?? ANIMALS[0]);
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
	function missed(e?: PointerEvent) {
		if (closed || (e && (!e.isPrimary || e.button !== 0))) return;
		setHint((n) => n + 1);
		clearTimeout(hintTimer.current);
		hintTimer.current = setTimeout(() => setHint(0), HINT);
	}
	// The chomped face and the burst come up only later: have them ready.
	useEffect(() => {
		new Image().src = `${ART}/chomp.webp`;
		new Image().src = `${ART}/${animal.id}/chomped.webp`;
	}, [animal]);

	// A finger (or mouse) down on the mouth: the tooth nearest it, if one's close enough (otherwise it's a
	// miss, and the nudge). On the press itself, not a click: Safari drops the click for a slow press, or on
	// a picture that isn't a button. Where it is from the picture's box on screen, which stays right when
	// the phone turns or the window resizes (Safari's getScreenCTM goes wrong once the page has shifted).
	function tapMouth(e: PointerEvent<SVGSVGElement>) {
		if (closed || !e.isPrimary || e.button !== 0) return;
		const box = e.currentTarget.getBoundingClientRect();
		const [fw, fh] = animal.frame;
		const at = { x: ((e.clientX - box.left) / box.width) * fw, y: ((e.clientY - box.top) / box.height) * fh };
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
		// The next game's animal, its pictures loading while this one laughs.
		const nextId = pickAnimal();
		const next = ANIMALS.find((a) => a.id === nextId) ?? animal;
		for (const art of ["shut.webp", "open.webp", ...next.teeth.map((_, k) => `bottom-${k + 1}.png`)]) new Image().src = `${ART}/${next.id}/${art}`;
		later(() => setLaughing(true), SNAP);
		later(() => {
			setLaughing(false);
			setChomped(null);
			setOpen(false);
			setPressed([]);
			setAnimal(next);
			setChompTooth(Math.floor(Math.random() * next.teeth.length));
			const first = (starter + 1) % players.length;
			setStarter(first);
			setTurn(first);
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
					<div className={sides ? s.chompSides : s.column} onPointerDown={missed}>
						{sides ? tag(0) : <div className={s.chompPlayers} style={{ height: tagSize }}>{players.map((_, i) => tag(i))}</div>}
						<div className={s.chompStage} style={{ width }}>
							<svg className={`${s.chompHead} ${laughing ? s.chompLaugh : ""}`} viewBox={`0 0 ${fw} ${fh}`}
								role="img" aria-label={`${animal.name}, mouth ${closed ? "shut" : "open"}`} onPointerDown={tapMouth}>
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
													// A finger's press goes to the nearest tooth (above); this is for a click with no
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
