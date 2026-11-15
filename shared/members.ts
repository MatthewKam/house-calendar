// The family (server/members.ts): what the member routes take and give back, written once for the
// server. The web app keeps its own Member and MemberPatch in web/src/lib/types.ts on purpose (audit
// S5): its edit is narrower (no sortOrder, and a colour goes through its own request when signed in).

import { z } from 'zod';
import { Stage } from './stages.ts';

/** A colour, #rrggbb. */
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const name = z.string().min(1).max(40);

/** Someone new in the family (POST /api/members). */
export const MemberInput = z.strictObject({ name, color });

/** A change to someone (PATCH /api/members/:id): any of these, at least one. */
export const MemberPatch = z
	.strictObject({
		name,
		/** Signed out only; signed in, a colour goes through PUT /api/members/:id/color. */
		color,
		sortOrder: z.int(),
		/** YYYY-MM-DD; a real day, not in the future (the server checks). */
		birthdate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.nullable(),
		/** The stage a guardian chose; null: from the birthdate. */
		stage: Stage.nullable(),
		/** Their allergies (peanuts, milk, their own), all of them; kept lowercase, each once. */
		allergies: z.array(z.string().min(1).max(40)).max(20),
	})
	.partial();

/** A new colour for someone (PUT /api/members/:id/color). */
export const MemberColor = z.strictObject({ color });
/** The account holder's answer to a new colour asked for (POST /api/members/:id/color/answer). */
export const ColorAnswer = z.strictObject({ approve: z.boolean() });

/** Someone in the family, as the server gives them back. */
export const Member = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string(),
	sortOrder: z.int(),
	/** YYYY-MM-DD, when it's been set. */
	birthdate: z.string().nullable(),
	/** The stage in effect: the one a guardian chose, else from the birthdate; null with neither. */
	stage: Stage.nullable(),
	/** The stage a guardian chose; null when it comes from the birthdate. */
	stageChosen: Stage.nullable(),
	/** Their allergies, lowercase (recipes flag them). */
	allergies: z.array(z.string()),
	/** A guardian (known only when signed in): only they change their own color. */
	guardian: z.boolean(),
	/** A new color waiting for the account holder to approve, and who asked. */
	colorAsked: z.object({ color: z.string(), by: z.string().nullable() }).nullable(),
});

export type MemberInput = z.infer<typeof MemberInput>;
export type MemberPatch = z.infer<typeof MemberPatch>;
export type Member = z.infer<typeof Member>;
