import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Board } from "./parts";
import { fresh, shuffle } from "./rounds";
import s from "../../styles/Learn.module.css";

/** Who's playing: two names and colors, taking turns. */
export interface Player { name: string; color: string }

/** Teeth in the mouth, and chomps before the hooray. */
const TEETH = 8;
const CHOMPS = 3;
/** How long a chomp lasts: the snap, the laugh, then the mouth opens again (ms). */
const SNAP = 450;
const LAUGH = 1400;

/** The animals, each a big head with its mouth open: its colors, and what makes it itself. */
const ANIMALS: { id: string; name: string; skin: string; belly: string; extra: (skin: string) => ReactNode }[] = [
	{ id: "crocodile", name: "Crocodile", skin: "#4f9a4a", belly: "#c9dd8a", extra: (skin) => <Bumps skin={skin} /> },
	{ id: "alligator", name: "Alligator", skin: "#3f6f3c", belly: "#b5c98a", extra: (skin) => <Bumps skin={skin} wide /> },
	{ id: "shark", name: "Shark", skin: "#6f8fa8", belly: "#eef2f5", extra: (skin) => <path d="M210 30 L250 -40 L290 40z" fill={skin} /> },
	{ id: "dinosaur", name: "Dinosaur", skin: "#e0883c", belly: "#f6d49a", extra: () => <Spikes /> },
	{ id: "hippo", name: "Hippo", skin: "#9a8bb0", belly: "#e7c2cf", extra: (skin) => <Ears skin={skin} /> },
	{ id: "lion", name: "Lion", skin: "#e9b04a", belly: "#f7dfa8", extra: () => <Mane /> },
];

/**
 * Chomp! (a game for two, a toddler and a sibling or grown-up): a big animal, its mouth shut until
 * Ready! opens it. Take turns pressing a tooth down; one of them makes the mouth snap shut, a surprise, never a loss: the
 * animal laughs, the one who got chomped laughs too, and the teeth pop back up, mouth shut, until Ready!
 * opens it for another go. A few
 * chomps, then the hooray. A new animal each game.
 */
export default function Chomp({ players, onDone, onBack }: { players: Player[]; onDone: () => void; onBack: () => void }) {
	const animal = useMemo(() => fresh("chomp.animals", ANIMALS, 1, (a) => a.id)[0], []);
	const [pressed, setPressed] = useState<number[]>([]);
	const [chompTooth, setChompTooth] = useState(() => Math.floor(Math.random() * TEETH));
	const [turn, setTurn] = useState(() => Math.floor(Math.random() * players.length));
	const [chomped, setChomped] = useState<number | null>(null);
	const [laughing, setLaughing] = useState(false);
	const [chomps, setChomps] = useState(0);
	const [cheer, setCheer] = useState(false);
	// The mouth starts shut, with Ready! to open it; after each chomp it stays shut until Ready! again.
	const [open, setOpen] = useState(false);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
	useEffect(() => () => timers.current.forEach(clearTimeout), []);
	const closed = !open || chomped !== null;

	function press(i: number) {
		if (closed || cheer || pressed.includes(i)) return;
		setPressed([...pressed, i]);
		if (i !== chompTooth) {
			setTurn((t) => (t + 1) % players.length);
			return;
		}
		// Chomp! The mouth snaps shut on whoever's turn it was; a laugh; then open again, teeth up.
		setChomped(turn);
		later(() => setLaughing(true), SNAP);
		later(() => {
			const now = chomps + 1;
			setChomps(now);
			setLaughing(false);
			setChomped(null);
			setOpen(false);
			setPressed([]);
			setChompTooth(shuffle(Array.from({ length: TEETH }, (_, k) => k)).find((k) => k !== i) ?? 0);
			setTurn((t) => (t + 1) % players.length);
			if (now >= CHOMPS) {
				setCheer(true);
				later(onDone, 2200);
			}
		}, SNAP + LAUGH);
	}

	return (
		<Board onBack={onBack} total={CHOMPS} done={chomps} cheer={cheer}>
			{(box) => {
				const tagSize = Math.min(64, Math.max(44, box.h * 0.08));
				// The drawing's frame has room above for the top jaw swung open.
				const width = Math.min(box.w, (box.h - tagSize - 24) * (420 / 480));
				return (
					<div className={s.column}>
						{/* Whose turn: each player's name in their color; the one up is big and bright. Who just got
						    chomped bounces. */}
						<div className={s.chompPlayers} style={{ height: tagSize }}>
							{players.map((p, i) => (
								<span key={i} className={`${s.chompTag} ${i === turn && !closed ? s.chompUp : ""} ${chomped === i ? s.chompGot : ""}`}
									style={{ "--pc": p.color, fontSize: tagSize * 0.42 } as CSSProperties}>
									{p.name}
								</span>
							))}
						</div>
						{/* Ready? Opens the mouth to start (and again after each chomp). */}
						{!open && !cheer && chomped === null && (
							<button type="button" className={`${s.go} ${s.chompReady} ${s.pop}`} onClick={() => setOpen(true)}>
								Ready!
							</button>
						)}
						<svg className={`${s.chompHead} ${laughing ? s.chompLaugh : ""}`} viewBox="-10 -150 420 480" style={{ width }}
							role="img" aria-label={`${animal.name}, mouth ${closed ? "shut" : "open"}`}>
							{/* Lower jaw: the inside of the mouth, the tongue, and the teeth to press. */}
							<path d="M40 190 Q40 300 200 300 Q360 300 380 220 L380 190z" fill={animal.skin} />
							<path d="M60 190 Q70 270 200 272 Q340 272 362 196z" fill={animal.belly} />
							<path d="M70 190 Q90 250 200 250 Q320 250 350 192z" fill="#8a2f3c" />
							<ellipse cx="200" cy="232" rx="70" ry="16" fill="#e8707c" />
							{/* Shut: the lips meet, so none of the inside shows (the top teeth rest over the edge). */}
							<path className={`${s.lips} ${closed ? s.lipsShut : ""}`} d="M40 186 Q40 300 200 300 Q360 300 380 220 L380 186z" fill={animal.skin} />
							<path className={`${s.lips} ${closed ? s.lipsShut : ""}`} d="M70 196 Q200 214 370 194" fill="none" stroke="#2b2b2b" strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" />
							{Array.from({ length: TEETH }, (_, i) => {
								const x = 92 + (i * (338 - 92)) / (TEETH - 1);
								const down = pressed.includes(i);
								return (
									<g key={i} className={`${s.tooth} ${down ? s.toothDown : ""}`} role="button" tabIndex={0}
										aria-label={`Tooth ${i + 1}${down ? ", pressed" : ""}`} onClick={() => press(i)}
										onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && press(i)}>
										{/* A big invisible target, easier for little fingers than the tooth itself. */}
										<rect x={x - 18} y="140" width="36" height="70" fill="transparent" />
										<path d={`M${x - 14} 196 L${x} 160 L${x + 14} 196z`} fill="#fff" stroke="#e3dccf" strokeWidth="2" strokeLinejoin="round" />
									</g>
								);
							})}
							{/* Upper jaw: the head, swinging down from the back to snap shut. */}
							<g className={`${s.upperJaw} ${closed ? s.jawShut : ""}`}>
								{animal.extra(animal.skin)}
								<path d="M30 190 Q20 60 140 30 Q300 0 390 120 Q400 170 380 190z" fill={animal.skin} />
								{/* Its top teeth, pointing down. */}
								{Array.from({ length: TEETH - 1 }, (_, i) => {
									const x = 104 + (i * (326 - 104)) / (TEETH - 2);
									return <path key={i} d={`M${x - 11} 188 L${x} 214 L${x + 11} 188z`} fill="#fff" />;
								})}
								{/* Nostrils at the end of the snout, and eyes up top. */}
								<circle cx="350" cy="96" r="7" fill="#2b2b2b" opacity=".7" />
								<circle cx="372" cy="110" r="6" fill="#2b2b2b" opacity=".7" />
								<circle cx="130" cy="70" r="30" fill="#fff" />
								<circle cx="200" cy="56" r="30" fill="#fff" />
								<circle cx={laughing ? 130 : 138} cy={laughing ? 72 : 74} r="13" fill="#2b2b2b" />
								<circle cx={laughing ? 200 : 208} cy={laughing ? 58 : 60} r="13" fill="#2b2b2b" />
								{laughing && (
									<g stroke="#2b2b2b" strokeWidth="5" strokeLinecap="round" fill="none">
										<path d="M108 52 q22 -14 44 0 M178 38 q22 -14 44 0" />
									</g>
								)}
							</g>
						</svg>
					</div>
				);
			}}
		</Board>
	);
}

/** A crocodile's (or alligator's) bumpy back, along the top of its head. */
function Bumps({ skin, wide }: { skin: string; wide?: boolean }) {
	return (
		<g fill={skin}>
			{[90, 140, 190, 240, 290].map((x, i) => <ellipse key={x} cx={x} cy={36 - i * 3} rx={wide ? 26 : 20} ry="16" />)}
		</g>
	);
}

/** A dinosaur's spikes down the back of its head. */
function Spikes() {
	return (
		<g fill="#4f9a4a">
			<path d="M60 70 L50 10 L100 46z M110 40 L110 -20 L160 28z M170 26 L180 -34 L220 22z" />
		</g>
	);
}

/** A hippo's little round ears. */
function Ears({ skin }: { skin: string }) {
	return (
		<g fill={skin}>
			<circle cx="100" cy="40" r="22" />
			<circle cx="190" cy="20" r="22" />
		</g>
	);
}

/** A lion's mane, behind its head. */
function Mane() {
	return <path d="M10 200 Q-20 80 60 20 Q140 -40 240 -10 Q300 10 300 60 L200 120z" fill="#b5651d" />;
}
