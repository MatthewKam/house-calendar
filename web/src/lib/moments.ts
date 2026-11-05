import type { MomentKind } from "./types";

// The six activities moments and goals are grouped by, as pictures first (for kids 2–6) with a
// short word for the parent, and how the cheer says it.

export const MOMENT_KINDS: { kind: MomentKind; emoji: string; label: string; cheer: string }[] = [
	{ kind: "helpful", emoji: "🤝", label: "Helpful", cheer: "being helpful" },
	{ kind: "attitude", emoji: "😊", label: "Attitude", cheer: "a great attitude" },
	{ kind: "bravery", emoji: "🦁", label: "Bravery", cheer: "being brave" },
	{ kind: "cleanliness", emoji: "🧼", label: "Cleanliness", cheer: "keeping things clean" },
	{ kind: "problem_solving", emoji: "🧩", label: "Problem solving", cheer: "solving a problem" },
	{ kind: "self_care", emoji: "🪥", label: "Self care", cheer: "taking care of yourself" },
];

export const momentKind = (kind: MomentKind) => MOMENT_KINDS.find((k) => k.kind === kind) ?? MOMENT_KINDS[0];
