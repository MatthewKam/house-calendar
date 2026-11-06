import type { PottyStep } from "./types";

// The potty chart's rows, one per step of a trip, as pictures first (for kids 2–6) with the words a
// parent reads out (server/potty.ts).

export const POTTY_STEPS: { step: PottyStep; emoji: string; label: string }[] = [
	{ step: "ask", emoji: "🗣️", label: "I said I need to go" },
	{ step: "sit", emoji: "🚽", label: "I sat on the potty" },
	{ step: "go", emoji: "💧", label: "I went pee or poo" },
	{ step: "wipe", emoji: "🧻", label: "I wiped and flushed" },
	{ step: "wash", emoji: "🧼", label: "I washed my hands" },
];

/** Punches to fill a row (and earn its star). */
export const ROW_PUNCHES = 7;

export const PEE_POO = { pee: "💧", poo: "💩" } as const;
