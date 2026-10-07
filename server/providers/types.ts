// Contract every calendar backend implements. iCloud (CalDAV) reads and writes today; Google
// (Calendar API v3) slots in here later.

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
}

export interface RemoteCalendar {
  remoteId: string;
  name: string;
  /** #rrggbb as set in the provider's own app, when it has one. */
  color?: string;
  /** False for calendars we can only read (shared read-only, subscribed); unknown counts as true. */
  writable?: boolean;
}

/**
 * Read side. Sync pulls a full snapshot of a date window and replaces the stored copy: a family
 * calendar is small, and a snapshot avoids tracking how repeating events were expanded last time.
 */
export interface CalendarSource {
  readonly id: 'google' | 'icloud';
  listCalendars(): Promise<RemoteCalendar[]>;
  /** Every occurrence overlapping [from, to). */
  fetchRange(calendarRemoteId: string, from: Date, to: Date): Promise<RemoteEvent[]>;
}

/**
 * Write side, for edits made on the wall: one event resource (its URL is the part of a remoteId
 * before '#') read and written whole, the way CalDAV works.
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
