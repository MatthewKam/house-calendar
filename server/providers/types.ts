// Contract every calendar backend implements. iCloud (CalDAV) reads today; writes and Google
// (Calendar API v3) slot in here later.

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

export class ConflictError extends Error {
  constructor(public readonly current: RemoteEvent | null) {
    super('Event changed on another device');
  }
}

/** Write side, for edits made on the wall. Not implemented by any provider yet. */
export interface CalendarProvider extends CalendarSource {
  create(calendarRemoteId: string, ev: Omit<RemoteEvent, 'remoteId' | 'etag'>): Promise<RemoteEvent>;
  /** Throws ConflictError when the stored etag no longer matches (HTTP 412). */
  update(calendarRemoteId: string, ev: RemoteEvent): Promise<RemoteEvent>;
  remove(calendarRemoteId: string, remoteId: string, etag: string): Promise<void>;
}
