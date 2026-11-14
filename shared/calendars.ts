// Synced calendars, how syncing is going, and the calendar accounts behind them (server/calendars.ts):
// what the server takes and gives back, written once. The server checks requests against these and the
// web app imports their types (types only, so zod stays out of its bundle).

import { z } from 'zod';

/**
 * Who sees an event (server/privacy.ts): everyone; busy (others see "Busy" at that time); private
 * (others don't see it).
 */
export const Visibility = z.enum(['everyone', 'busy', 'private']);
/** Where a synced calendar comes from. */
export const Provider = z.enum(['icloud', 'google']);

/** A change to a synced calendar (PATCH /api/calendars/:id): any of these, at least one. */
export const CalendarPatch = z
	.strictObject({
		/** Everyone's events in it are this person's; null lets manual picks and Claude decide per event. */
		memberId: z.string().nullable(),
		hidden: z.boolean(),
		/** Who sees its events, unless an event says otherwise. */
		visibility: Visibility,
	})
	.partial();

/** Connecting iCloud with an Apple ID and an app-specific password (POST /api/connections/icloud). */
export const ICloudSignIn = z.strictObject({
	appleId: z.string().min(3).max(200),
	password: z.string().min(1).max(100),
});

/** A synced calendar and how it shows on the wall. */
export const SyncedCalendar = z.object({
	id: z.string(),
	provider: Provider,
	name: z.string(),
	/** Its color in Apple Calendar, if any. */
	color: z.string().nullable(),
	memberId: z.string().nullable(),
	hidden: z.boolean(),
	/** Distinct events (a repeating event counts once). */
	events: z.int(),
	/** New events can be added to it from the wall. */
	writable: z.boolean(),
	visibility: Visibility,
	/** A few upcoming titles, to tell same-named calendars apart. */
	sample: z.array(z.string()),
});

/** How calendar syncing is going (GET /api/sync; null when no account is set up). */
export const SyncStatus = z.object({
	provider: Provider,
	/** True while a sync is running. */
	running: z.boolean(),
	lastSuccess: z.string().nullable(),
	lastError: z.string().nullable(),
	calendars: z.int(),
	events: z.int(),
	/** Set when Claude couldn't sort events by person; the sync itself still succeeded. */
	peopleError: z.string().nullable(),
	/** Whether events can be changed on the wall and sent back. */
	canWrite: z.boolean(),
});

/** One person's Google or iCloud calendar account. */
export const Connection = z.object({
	id: z.string(),
	account: z.string(),
	/** Who connected it; null: a wall unlocked by a parent, for no one. */
	memberId: z.string().nullable(),
	connectedAt: z.string(),
	lastSuccess: z.string().nullable(),
	lastError: z.string().nullable(),
	calendars: z.int(),
});
/** Every calendar account (GET /api/connections); null where that kind is off. */
export const Connections = z.object({
	google: z.array(Connection).nullable(),
	icloud: z.array(Connection).nullable(),
});

export type Visibility = z.infer<typeof Visibility>;
export type CalendarPatch = z.infer<typeof CalendarPatch>;
export type ICloudSignIn = z.infer<typeof ICloudSignIn>;
export type SyncedCalendar = z.infer<typeof SyncedCalendar>;
export type SyncStatus = z.infer<typeof SyncStatus>;
export type Connection = z.infer<typeof Connection>;
export type Connections = z.infer<typeof Connections>;
