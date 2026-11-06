import { useState } from "react";

/** An activity's props: its level, and what to call when every round is done. */
export interface ActivityProps {
	level: number;
	/** Rounds played, and how many were right on the first try. */
	onDone: (rounds: number, firstTry: number) => void;
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
 * Rounds of a pick-the-right-one activity: which round it is, whether it's been got, and how many were
 * got on the first try. `tap(ok)` is a pick; `next()` moves on, or finishes.
 */
export function useRounds(total: number, onDone: ActivityProps["onDone"]) {
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
