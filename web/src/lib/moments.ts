import type { MomentKind } from "./types";

// The five kinds of moment, as pictures first (for kids 2–6) with a short word for the parent.

export const MOMENT_KINDS: { kind: MomentKind; emoji: string; label: string; cheer: string }[] = [
	{ kind: "helping", emoji: "🤝", label: "Helping", cheer: "helping others" },
	{ kind: "feelings", emoji: "💛", label: "Feelings", cheer: "handling big feelings" },
	{ kind: "myself", emoji: "🪥", label: "Looking after me", cheer: "looking after yourself" },
	{ kind: "body", emoji: "💪", label: "Body", cheer: "trying something with your body" },
	{ kind: "thinking", emoji: "💡", label: "Thinking", cheer: "thinking it through" },
];

export const momentKind = (kind: MomentKind) => MOMENT_KINDS.find((k) => k.kind === kind)!;
