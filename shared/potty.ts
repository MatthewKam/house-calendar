// Potty charts (server/potty.ts): what the server takes and gives back, written once. The server checks
// requests against these and the web app imports their types (types only, so zod stays out of its bundle).

import { z } from 'zod';

/** One step of a potty trip, each with its own row on the card. */
export const PottyStep = z.enum(['ask', 'sit', 'go', 'wipe', 'wash']);
/** What the go row says it was. */
export const PottyKind = z.enum(['pee', 'poo', 'both']);

/** A parent starts or stops a kid's chart (PUT /api/potty/:memberId). */
export const PottyOn = z.strictObject({ on: z.boolean() });
/** One step done (POST /api/potty/:memberId): the go row says which, the others don't. */
export const Punch = z.strictObject({ step: PottyStep, kind: PottyKind.optional() });

/** A kid's potty chart: the card being filled (each row's punches; the go row says which), and cards filled before. */
export const PottyChart = z.object({
	memberId: z.string(),
	card: z.object({
		id: z.string(),
		startedAt: z.string(),
		rows: z.record(PottyStep, z.array(PottyKind.nullable())),
	}),
	/** Newest first. */
	filled: z.array(z.object({ startedAt: z.string(), finishedAt: z.string() })),
});
/** What a punch gives back: whether it filled its row (a star) and the card. */
export const Punched = z.object({ rowFull: z.boolean(), cardFull: z.boolean(), chart: PottyChart });

export type PottyStep = z.infer<typeof PottyStep>;
export type PottyKind = z.infer<typeof PottyKind>;
export type Punch = z.infer<typeof Punch>;
export type PottyChart = z.infer<typeof PottyChart>;
export type Punched = z.infer<typeof Punched>;
