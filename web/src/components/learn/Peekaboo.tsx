import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board, fit, Hear } from "./parts";
import { animalsUpTo } from "./things";
import { at, fresh, pick, type GameProps } from "./rounds";
import { noise } from "./sound";
import s from "../../styles/Learn.module.css";

/** Bushes, by level. Up to 3, everyone just says hello; from 4, find who made the noise. */
const BUSHES = [3, 4, 5, 4, 5, 6];
const LISTEN_FROM = 4;
const LISTEN_ROUNDS = 3;

/** Different skies each play: day, morning, sunset. */
const SKIES = [
	{ sky: "#cfe9ff", hill: "#a6dc8a", light: "#ffd95a" },
	{ sky: "#ffe3c4", hill: "#9fd28a", light: "#ffb347" },
	{ sky: "#ffd1dc", hill: "#8cc98a", light: "#ff8c69" },
	{ sky: "#d9f2e6", hill: "#b5e08a", light: "#fff07a" },
];
const NIGHT = { sky: "#26305e", hill: "#3f6b4a", light: "#f4f1ec" };

/**
 * Peekaboo farm (age 2): tap a bush and an animal pops out, making its noise; tap it again to hear it
 * again. Once everyone's out, night falls. From level 4 it's listening: a noise plays, and the kid
 * finds the bush hiding who made it (a wrong bush shows its animal, then it ducks back down).
 */
export default function Peekaboo({ level, onDone, onBack }: GameProps) {
	const listening = level >= LISTEN_FROM;
	const look = useMemo(() => fresh("peekaboo.skies", SKIES, 1, (x) => x.sky)[0], []);
	const hiding = useMemo(() => fresh(`peekaboo.${level}`, animalsUpTo(Math.max(level, 2)), at(BUSHES, level), (a) => a.id), [level]);
	// Listening: who to find each round.
	const asks = useMemo(() => pick(hiding, Math.min(LISTEN_ROUNDS, hiding.length)), [hiding]);
	const [out, setOut] = useState<number[]>([]);
	const outNow = useRef<number[]>([]);
	const [peeking, setPeeking] = useState<number | null>(null);
	const [taps, setTaps] = useState<{ i: number; n: number } | null>(null);
	const [round, setRound] = useState(0);
	const [firstTry, setFirstTry] = useState(0);
	const [missed, setMissed] = useState(false);
	const [night, setNight] = useState(false);
	// Listening: the cheer, while the one found shows.
	const [cheering, setCheering] = useState(false);
	// Timers for what comes next, all stopped if they leave.
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
	useEffect(() => () => timers.current.forEach(clearTimeout), []);
	const unpeek = useRef<ReturnType<typeof setTimeout>>(undefined);

	const ask = listening ? asks[round] : null;
	// Listening: each round starts with the noise.
	useEffect(() => {
		if (!ask) return;
		const t = setTimeout(() => noise(ask), 500);
		return () => clearTimeout(t);
	}, [ask]);

	function finish(rounds: number, right: number) {
		later(() => setNight(true), 1800);
		later(() => onDone(rounds, right), 4500);
	}

	function tap(i: number) {
		if (night) return;
		const a = hiding[i];
		noise(a);
		setTaps((t) => ({ i, n: (t?.n ?? 0) + 1 }));
		if (!listening) {
			// Read and kept in a ref too, so quick taps in a row each count.
			if (outNow.current.includes(i)) return;
			outNow.current = [...outNow.current, i];
			setOut(outNow.current);
			if (outNow.current.length === hiding.length) finish(1, 1);
			return;
		}
		if (out.includes(i) || !ask) return;
		if (a.id !== ask.id) {
			// The wrong one peeks out, then hides again.
			setMissed(true);
			setPeeking(i);
			clearTimeout(unpeek.current);
			unpeek.current = setTimeout(() => setPeeking(null), 1500);
			return;
		}
		outNow.current = [...outNow.current, i];
		setOut(outNow.current);
		setPeeking(null);
		const right = firstTry + (missed ? 0 : 1);
		setFirstTry(right);
		setMissed(false);
		setCheering(true);
		later(() => setCheering(false), 1600);
		if (round + 1 >= asks.length) finish(asks.length, right);
		else later(() => setRound(round + 1), 1800);
	}

	const colors = night ? NIGHT : look;
	return (
		<Board onBack={onBack} total={listening ? asks.length : undefined} done={listening ? out.length : undefined}
			cheer={cheering}>
			{(box) => {
				// Each bush has room above it for its animal to pop up.
				const grid = fit(hiding.length, { w: box.w - 24, h: box.h * 0.62 }, { gap: 12, shape: 0.8, most: 260 });
				return (
					<div className={s.farm} style={{ "--sky": colors.sky, "--hill": colors.hill, "--light": colors.light } as CSSProperties}>
						<Farm night={night} />
						{listening && !night && (
							<div className={s.farmAsk}>
								<Hear size={Math.min(100, Math.max(68, box.h * 0.15))} onTap={() => ask && noise(ask)} label="Hear who's hiding" />
							</div>
						)}
						<div className={s.bushes} style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.size}px)` }}>
							{hiding.map((a, i) => {
								const shown = out.includes(i) || peeking === i;
								const tapped = taps?.i === i;
								return (
									<button key={i} type="button" className={s.bushSpot} onClick={() => tap(i)}
										style={{ width: grid.size, height: grid.size * 1.25 }}
										aria-label={shown ? `${a.name}: tap to hear it again` : "A bush. Who's hiding?"}>
										{shown && (
											<span key={tapped ? taps.n : 0} className={`${s.peeker} ${night ? s.snore : s.peek}`}>
												<Pic id={a.id} />
											</span>
										)}
										<span key={`b${tapped ? taps.n : 0}`} className={`${s.bush} ${tapped ? s.rustle : ""}`}>
											<Pic id="bush" />
										</span>
									</button>
								);
							})}
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
