import type { PottyKind, PottyStep } from "./types";

// The potty chart's rows, one per step of a trip, as pictures first (for kids 2–6) with the words a
// parent reads out (server/potty.ts).

export const POTTY_STEPS: { step: PottyStep; emoji: string; label: string }[] = [
	{ step: "ask", emoji: "🗣️", label: "I said I need to go" },
	{ step: "sit", emoji: "🚽", label: "I sat on the potty" },
	{ step: "go", emoji: "💧", label: "I went pee or poop" },
	{ step: "wipe", emoji: "🧻", label: "I wiped and flushed" },
	{ step: "wash", emoji: "🧼", label: "I washed my hands" },
];

/** Punches to fill a row (and earn its star). */
export const ROW_PUNCHES = 7;

/** The go row's choices: the sticker each leaves, and its word. */
export const PEE_POO: { kind: PottyKind; emoji: string; label: string }[] = [
	{ kind: "pee", emoji: "💧", label: "Pee" },
	{ kind: "poo", emoji: "💩", label: "Poop" },
	{ kind: "both", emoji: "💧💩", label: "Both" },
];
export const peePoo = (kind: PottyKind) => PEE_POO.find((p) => p.kind === kind) ?? PEE_POO[0];
