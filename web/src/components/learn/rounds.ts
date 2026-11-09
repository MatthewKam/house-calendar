import { useEffect, useRef, useState } from "react";

/** A game's props: its level, what to call when it's finished, and the way back to the games. */
export interface GameProps {
	level: number;
	/** Rounds played, and how many were right on the first try (all of them, three plays running, moves it up). */
	onDone: (rounds: number, firstTry: number) => void;
	onBack: () => void;
}

/** A copy in random order. */
export function shuffle<T>(list: readonly T[]): T[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** `n` different ones, at random. */
export const pick = <T,>(list: readonly T[], n: number) => shuffle(list).slice(0, n);

/**
 * `n` different ones at random, but not ones this game showed recently (on this device): it keeps a list
 * of what it's shown, and only once everything's been seen does it start over. So each play is new.
 * `memory` names the list (a game and what it's picking, e.g. "letters.words").
 */
export function fresh<T>(memory: string, list: readonly T[], n: number, idOf: (t: T) => string = String): T[] {
	const key = `sprig.learn.seen.${memory}`;
	let seen: string[] = [];
	try {
		seen = JSON.parse(localStorage.getItem(key) ?? "[]");
	} catch {
		// Not kept (a private window, say): every pick's just random.
	}
	const unseen = list.filter((t) => !seen.includes(idOf(t)));
	// Not enough new ones left: those, then start over with the rest (not the very last one again, if
	// there are enough others).
	const rest = list.filter((t) => !unseen.includes(t));
	const notLast = rest.filter((t) => idOf(t) !== seen[seen.length - 1]);
	const again = notLast.length >= n - unseen.length ? notLast : rest;
	const picked = unseen.length >= n ? pick(unseen, n) : [...shuffle(unseen), ...pick(again, n - unseen.length)];
	const now = unseen.length >= n ? [...seen, ...picked.map(idOf)] : picked.map(idOf);
	try {
		localStorage.setItem(key, JSON.stringify(now));
	} catch {
		// As above.
	}
	return picked;
}

/** One at random. */
export const any = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** A whole number from `lo` to `hi`. */
export const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** A level's setting, from a list of one per level (the last for any above it). */
export const at = <T,>(perLevel: readonly T[], level: number) => perLevel[Math.min(level, perLevel.length) - 1];

/** How long the cheer shows before the next round starts by itself. */
export const CHEER_MS = 1600;

/**
 * Rounds of a pick-the-right-one game: which round it is, whether it's been got (the cheer shows), and
 * how many were got on the first try. `tap(ok)` is a pick: right cheers, then moves on by itself (or
 * finishes); wrong just counts against the first try. `cheerMs` can be per round (the last one's cheer
 * can be longer).
 */
export function useRounds(total: number, onDone: GameProps["onDone"], cheerMs: number | ((round: number) => number) = CHEER_MS) {
	const [round, setRound] = useState(0);
	const [got, setGot] = useState(false);
	const [missed, setMissed] = useState(false);
	const firstTry = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	return {
		round,
		got,
		missed,
		tap(ok: boolean) {
			if (got) return;
			if (!ok) return setMissed(true);
			setGot(true);
			if (!missed) firstTry.current += 1;
			timer.current = setTimeout(() => {
				if (round + 1 >= total) onDone(total, firstTry.current);
				else {
					setRound(round + 1);
					setGot(false);
					setMissed(false);
				}
			}, typeof cheerMs === "function" ? cheerMs(round) : cheerMs);
		},
	};
}
