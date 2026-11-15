// Quick capture (server/capture.ts): what Say it and Snap a flyer send, and the cards that come back,
// written once. The server checks requests against these and the web app imports their types (types
// only, so zod stays out of its bundle).

import { z } from 'zod';

/** A picture to read, as base64, shrunk on the phone first. */
const Image = z.strictObject({
	mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
	data: z.string().max(8_000_000),
});
/** Something said, or a photo (POST /api/capture), with the device's time zone for "Friday at 10". */
export const CaptureRequest = z.strictObject({
	text: z.string().min(1).max(2000).optional(),
	image: Image.optional(),
	timeZone: z.string().max(64),
});

/** A card the app shows: what to add, with names already matched to people. */
export const Proposal = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('item'),
		title: z.string(),
		list: z.string(),
		due: z.string().nullable(),
		memberId: z.string().nullable(),
	}),
	z.object({
		kind: z.literal('event'),
		title: z.string(),
		allDay: z.boolean(),
		start: z.string(),
		end: z.string(),
		memberIds: z.array(z.string()),
		location: z.string().nullable(),
		notes: z.string().nullable(),
	}),
	z.object({ kind: z.literal('task'), title: z.string(), memberId: z.string(), day: z.string() }),
]);
/** What was found (POST /api/capture): the cards, for a grown-up to check. Nothing is saved yet. */
export const Captured = z.object({ proposals: z.array(Proposal) });
/** Whether Say it and Snap a flyer are on (GET /api/capture). */
export const CaptureOn = z.object({ on: z.boolean() });

export type CaptureRequest = z.infer<typeof CaptureRequest>;
export type Proposal = z.infer<typeof Proposal>;
export type Captured = z.infer<typeof Captured>;
export type CaptureOn = z.infer<typeof CaptureOn>;
