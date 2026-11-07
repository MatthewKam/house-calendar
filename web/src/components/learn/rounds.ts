import { useState } from "react";

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

/** One at random. */
export const any = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** A whole number from `lo` to `hi`. */
export const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** A level's setting, from a list of one per level (the last for any above it). */
export const at = <T,>(perLevel: readonly T[], level: number) => perLevel[Math.min(level, perLevel.length) - 1];

/**
 * Rounds of a pick-the-right-one game: which round it is, whether it's been got, and how many were got
 * on the first try. `tap(ok)` is a pick; `next()` moves on, or finishes.
 */
export function useRounds(total: number, onDone: GameProps["onDone"]) {
	const [round, setRound] = useState(0);
	const [got, setGot] = useState(false);
	const [missed, setMissed] = useState(false);
	const [firstTry, setFirstTry] = useState(0);
	return {
		round,
		got,
		missed,
		/** A pick: right ends the round; wrong just counts against the first try. */
		tap(ok: boolean) {
			if (got) return;
			if (ok) {
				setGot(true);
				if (!missed) setFirstTry((n) => n + 1);
			} else {
				setMissed(true);
			}
		},
		next() {
			if (round + 1 >= total) onDone(total, firstTry);
			else {
				setRound(round + 1);
				setGot(false);
				setMissed(false);
			}
		},
	};
}
