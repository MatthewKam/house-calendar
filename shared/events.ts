// Events on the wall (server/events.ts), with who sees them, special days, what to bring
// (server/checklists.ts) and wall edits waiting for iCloud (server/outbox.ts): what the server takes and
// gives back, written once. The server checks requests against these and the web app imports their
// types (types only, so zod stays out of its bundle).

import { z } from 'zod';
import { Visibility } from './calendars.ts';

/** A day, YYYY-MM-DD. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Who it's for, in family order; empty means everyone. */
const memberIds = z.array(z.string()).max(20);

/** What can be set on an event, with nothing filled in: an edit changes only what it sends. */
const eventFields = {
	title: z.string().min(1).max(200),
	memberIds,
	/** Where it is, on one line; null when there's no address. */
	location: z.string().max(300).nullable(),
	/** Notes go to iCloud with a synced event. */
	notes: z.string().max(4000).nullable(),
	/** A flyer photo (uploadFlyer) to keep with it; null takes it off. It stays here (iCloud has nowhere for it). */
	photoId: z.string().nullable(),
	allDay: z.boolean(),
	/** Timed: ISO UTC instant. All-day: YYYY-MM-DD. The server checks which. */
	start: z.string(),
	/** Timed: ISO UTC instant. All-day: YYYY-MM-DD, exclusive. */
	end: z.string(),
};

/**
 * Events overlapping a stretch (GET /api/events): its first and last local days, end exclusive, and the
 * same as UTC instants, so timed and all-day events can both be compared.
 */
export const EventRange = z.object({ from: z.string(), to: z.string(), fromDay: day, toDay: day });

/** A new event (POST /api/events). Left out: for everyone, no place, notes or flyer. */
export const EventInput = z.strictObject({
	...eventFields,
	memberIds: memberIds.default([]),
	location: eventFields.location.default(null),
	notes: eventFields.notes.default(null),
	photoId: eventFields.photoId.default(null),
	/** An iCloud calendar to add it to (sent there shortly); left out, it stays on the wall. */
	calendarId: z.string().optional(),
	/** Who sees it, when not its calendar's default (existing ones change it with PUT .../visibility). */
	visibility: Visibility.optional(),
	/** A countdown on kid mode's Today (existing ones change it with PUT .../special). */
	special: z.boolean().optional(),
});

/** Changing a repeating iCloud event: just the day opened, or every day. */
export const Scope = z.enum(['one', 'all']);
/** A change to an event (PATCH /api/events/:id): any of its fields, at least one. */
export const EventPatch = z.strictObject({ ...eventFields, scope: Scope }).partial();

/** Who sees an event, every repeat of it (PUT /api/events/:id/visibility); null: its calendar's default. */
export const EventVisibility = z.strictObject({ visibility: Visibility.nullable() });
/** Marked special or not, every repeat of it (PUT /api/events/:id/special). */
export const EventSpecial = z.strictObject({ special: z.boolean() });
/** Who a synced event is for, every repeat of it (PUT /api/events/:id/people); none: everyone. */
export const EventPeople = z.strictObject({ memberIds });

/** What to bring, every repeat of it (PUT /api/events/:id/checklist); an item without an id is new. */
export const ChecklistInput = z.strictObject({
	items: z
		.array(
			z.strictObject({
				id: z.string().optional(),
				title: z.string().min(1).max(80),
				/** An emoji, shown to the kids instead of the words. */
				picture: z.string().max(16).nullable().optional(),
			}),
		)
		.max(30),
});
/** Ticked or not, this time it happens (PUT /api/events/:id/checklist/:itemId). */
export const ChecklistTick = z.strictObject({ done: z.boolean() });

/** One thing to bring. */
export const ChecklistItem = z.object({
	id: z.string(),
	title: z.string(),
	/** An emoji, shown to the kids instead of the words. */
	picture: z.string().nullable(),
	/** Ticked, this time it happens. */
	done: z.boolean(),
});

/** An event as the server gives it back. */
export const CalEvent = z.object({
	id: z.string(),
	calendarId: z.string(),
	memberIds: z.array(z.string()),
	title: z.string(),
	allDay: z.boolean(),
	start: z.string(),
	end: z.string(),
	/** synced, or pending_update / pending_delete while a wall edit waits to reach iCloud. */
	syncState: z.string(),
	location: z.string().nullable(),
	/** One day of a repeating iCloud event: edits here change that day only. */
	repeats: z.boolean(),
	/** Who sees it: its own setting, else its calendar's (server/privacy.ts). */
	visibility: Visibility,
	/** Marked special: a countdown on kid mode's Today, for the kids it's for (every repeat of it). */
	special: z.boolean(),
	/** Its notes (an iCloud event's are its own, synced both ways), and the flyer it was read from. */
	notes: z.string().nullable(),
	photoUrl: z.string().nullable(),
	/** What to bring (every repeat of it), ticked for this time it happens. */
	checklist: z.array(ChecklistItem),
	/** Someone else's Busy time: no title or place, and it can't be opened. */
	busy: z.boolean().optional(),
});

/** An iCloud event's details, as compared in a conflict. */
export const EventDetails = z.object({
	title: z.string(),
	allDay: z.boolean(),
	start: z.string(),
	end: z.string(),
	location: z.string().nullable(),
	/** Its notes. Left out: not being changed. */
	notes: z.string().nullable().optional(),
});
/** Which side of a conflict stays (POST /api/outbox/:id/resolve). */
export const Resolve = z.strictObject({ keep: z.enum(['mine', 'theirs']) });
/** Wall edits waiting for iCloud, and ones changed on another device too (waiting for a choice). */
export const OutboxStatus = z.object({
	pending: z.int(),
	/** The newest problem sending, if edits are stuck (offline, or iCloud refusing). */
	lastError: z.string().nullable(),
	conflicts: z.array(
		z.object({
			id: z.int(),
			/** Only these are sent if the wall's version is kept; the rest stays as iCloud has it. */
			changed: z.array(EventDetails.keyof()),
			mine: EventDetails,
			/** Null when the event was deleted on the other device. */
			theirs: EventDetails.nullable(),
		}),
	),
});

/** A new event with every field there (what the server has once the defaults are filled in). */
export type EventInput = z.output<typeof EventInput>;
/** A new event as the web app sends it: what's left out is filled in. */
export type NewEvent = z.input<typeof EventInput>;
export type Scope = z.infer<typeof Scope>;
export type EventPatch = z.infer<typeof EventPatch>;
export type ChecklistInput = z.infer<typeof ChecklistInput>;
export type ChecklistItem = z.infer<typeof ChecklistItem>;
export type CalEvent = z.infer<typeof CalEvent>;
export type EventDetails = z.infer<typeof EventDetails>;
export type OutboxStatus = z.infer<typeof OutboxStatus>;
