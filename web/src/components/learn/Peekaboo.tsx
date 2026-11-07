import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board, Hear } from "./parts";
import { animalsUpTo } from "./things";
import { any, at, pick, type GameProps } from "./rounds";
import { noise, say } from "./sound";
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
	const look = useMemo(() => any(SKIES), []);
	const hiding = useMemo(() => pick(animalsUpTo(Math.max(level, 2)), at(BUSHES, level)), [level]);
	// Listening: who to find each round.
	const asks = useMemo(() => pick(hiding, Math.min(LISTEN_ROUNDS, hiding.length)), [hiding]);
	const [out, setOut] = useState<number[]>([]);
	const [peeking, setPeeking] = useState<number | null>(null);
	const [taps, setTaps] = useState<{ i: number; n: number } | null>(null);
	const [round, setRound] = useState(0);
	const [firstTry, setFirstTry] = useState(0);
	const [missed, setMissed] = useState(false);
	const [night, setNight] = useState(false);
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
		later(() => {
			setNight(true);
			say("Night night, farm.");
		}, 1800);
		later(() => onDone(rounds, right), 4500);
	}

	function tap(i: number) {
		if (night) return;
		const a = hiding[i];
		noise(a);
		setTaps((t) => ({ i, n: (t?.n ?? 0) + 1 }));
		if (!listening) {
			if (out.includes(i)) return;
			const now = [...out, i];
			setOut(now);
			if (now.length === hiding.length) finish(1, 1);
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
		setOut([...out, i]);
		setPeeking(null);
		const right = firstTry + (missed ? 0 : 1);
		setFirstTry(right);
		setMissed(false);
		if (round + 1 >= asks.length) finish(asks.length, right);
		else later(() => setRound(round + 1), 1800);
	}

	const colors = night ? NIGHT : look;
	return (
		<Board onBack={onBack} total={listening ? asks.length : undefined} done={listening ? out.length : undefined}
			className={s.scene}>
			<div className={s.farm} style={{ "--sky": colors.sky, "--hill": colors.hill, "--light": colors.light } as CSSProperties}>
				<span className={s.farmLight} aria-hidden="true" />
				{listening && !night && (
					<div className={s.farmAsk}>
						<Hear big onTap={() => ask && noise(ask)} label="Hear who's hiding" />
					</div>
				)}
				<div className={s.bushes} style={{ "--n": hiding.length } as CSSProperties}>
					{hiding.map((a, i) => {
						const shown = out.includes(i) || peeking === i;
						const tapped = taps?.i === i;
						return (
							<button key={i} type="button" className={s.bushSpot} onClick={() => tap(i)}
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
		</Board>
	);
}
