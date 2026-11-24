import type { Details, SeriesChanges } from './icalEdit.ts';

// Contract every calendar backend implements. iCloud (CalDAV) and Google (Calendar API v3) read and
// write; a phone's calendars are read only.

/**
 * One occurrence of an event. Repeating events arrive already expanded, one RemoteEvent per
 * occurrence, so the display never has to understand recurrence rules.
 */
export interface RemoteEvent {
	/** Stable per occurrence: the resource URL, plus "#<recurrence id>" for repeats. */
	remoteId: string;
	etag: string;
	title: string;
	allDay: boolean;
	/** Timed: ISO UTC instant. All-day: YYYY-MM-DD. */
	start: string;
	/** Timed: ISO UTC instant. All-day: YYYY-MM-DD, exclusive. */
	end: string;
	/** Where it is (LOCATION), on one line; null when there's none. */
	location?: string | null;
	/** Its notes (DESCRIPTION); null when there are none. */
	notes?: string | null;
}

export interface RemoteCalendar {
	remoteId: string;
	name: string;
	/** The account's own main calendar: linked to the person who connected it. */
	primary?: boolean;
	/** #rrggbb as set in the provider's own app, when it has one. */
	color?: string;
	/** False for calendars we can only read (shared read-only, subscribed); unknown counts as true. */
	writable?: boolean;
	/** The account it's in, where that's not the source itself (a phone's: "iCloud", "On My iPhone"). */
	account?: string;
}

/**
 * Read side. Sync pulls a full snapshot of a date window and replaces the stored copy: a family
 * calendar is small, and a snapshot avoids tracking how repeating events were expanded last time.
 */
export interface CalendarSource {
	readonly id: 'google' | 'icloud' | 'phone';
	/** Which account, when several of one kind sync (e.g. 'google:<connection id>'); else the id. */
	readonly key?: string;
	/** Who connected it; their primary calendar is linked to them. */
	readonly memberId?: string | null;
	listCalendars(): Promise<RemoteCalendar[]>;
	/** Every occurrence overlapping [from, to). */
	fetchRange(calendarRemoteId: string, from: Date, to: Date): Promise<RemoteEvent[]>;
	/** Where the wall's edits go, for a service that takes them in its own terms (Google). */
	readonly store?: EventStore;
}

/**
 * Write side, for edits made on the wall, in a calendar service's own terms (outbox.ts sends through
 * it). Each write is guarded by the `version` it was read at: false means it changed there since, so
 * read it again. `calendar` is the calendar's remoteId; `remoteId` and `seriesId` are as synced.
 * iCloud's comes from its CalendarWriter (icalStore.ts); Google's is its API (google.ts).
 */
export interface EventStore {
	/** Makes a new event under the remoteId the outbox gave it; done already if it's there. */
	create(calendar: string, remoteId: string, details: Details): Promise<void>;
	/** One occurrence as it is there now (details null when it no longer shows); null when it's gone. */
	read(calendar: string, remoteId: string): Promise<{ details: Details | null; version: unknown } | null>;
	update(calendar: string, remoteId: string, version: unknown, changes: Partial<Details>): Promise<boolean>;
	/** Deletes one occurrence (or the whole event, when it doesn't repeat). */
	remove(calendar: string, remoteId: string, version: unknown): Promise<boolean>;
	/** A repeating event's own title and address; null when it's gone. */
	readSeries(
		calendar: string,
		seriesId: string,
	): Promise<{ details: { title: string; location: string | null } | null; version: unknown } | null>;
	updateSeries(calendar: string, seriesId: string, version: unknown, changes: SeriesChanges): Promise<boolean>;
	removeSeries(calendar: string, seriesId: string, version: unknown): Promise<boolean>;
}

/**
 * iCloud's write side: one event resource (its URL is the part of a remoteId before '#') read and
 * written whole, the way CalDAV works.
 */
export interface CalendarWriter {
	/** The resource as it is now; null when it's been deleted. */
	getEvent(href: string): Promise<{ data: string; etag: string } | null>;
	/**
	 * Saves the resource (or deletes it, for null) only if unchanged since `etag`; false if it changed.
	 * An empty etag creates it, and false then means it already exists.
	 */
	writeEvent(href: string, etag: string, data: string | null): Promise<boolean>;
}
