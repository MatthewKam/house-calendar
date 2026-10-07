import { CalDavClient } from './caldav.ts';
import { expandCalendarData } from './ical.ts';
import type { CalendarSource, RemoteCalendar, RemoteEvent } from './types.ts';

const ICLOUD_CALDAV = 'https://caldav.icloud.com/';

/** Reads iCloud calendars with an Apple ID and an app-specific password. */
export class ICloudSource implements CalendarSource {
  readonly id = 'icloud' as const;
  private readonly client: CalDavClient;
  private home: string | null = null;

  constructor(appleId: string, appPassword: string, fetchImpl: typeof fetch = fetch) {
    this.client = new CalDavClient(appleId, appPassword, fetchImpl);
  }

  async listCalendars(): Promise<RemoteCalendar[]> {
    // The home URL points at the account's iCloud shard; it doesn't change, so look it up once.
    this.home ??= await this.client.calendarHome(ICLOUD_CALDAV);
    return (await this.client.calendars(this.home)).map((c) => ({ remoteId: c.url, name: c.name, color: c.color }));
  }

  async fetchRange(calendarRemoteId: string, from: Date, to: Date): Promise<RemoteEvent[]> {
    const resources = await this.client.events(calendarRemoteId, from, to);
    return resources.flatMap((r) => {
      try {
        return expandCalendarData(r.data, r.href, r.etag, from, to);
      } catch (err) {
        // One malformed event shouldn't hide the rest of the calendar.
        console.warn(`Skipping unreadable iCloud event ${r.href}:`, err);
        return [];
      }
    });
  }
}
