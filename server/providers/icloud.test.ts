import { describe, expect, it } from 'vitest';
import { ICloudSource } from './icloud.ts';
import { CalDavAuthError } from './caldav.ts';

const ms = (...responses: string[]) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${responses.join('')}</d:multistatus>`;
const ok = (href: string, props: string) =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;

const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Swim &amp; snack',
  'DTSTART:20261006T160000Z', 'DTEND:20261006T170000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

/** Answers the CalDAV calls iCloud would, keyed by method and URL. */
function fakeICloud(calls: { method: string; url: string; auth: string }[] = []) {
  const routes: Record<string, string> = {
    'PROPFIND https://caldav.icloud.com/': ms(ok('/', '<d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal>')),
    'PROPFIND https://caldav.icloud.com/123/principal/': ms(ok('/123/principal/',
      '<c:calendar-home-set><d:href>https://p42-caldav.icloud.com:443/123/calendars/</d:href></c:calendar-home-set>')),
    'PROPFIND https://p42-caldav.icloud.com/123/calendars/': ms(
      ok('/123/calendars/', '<d:resourcetype><d:collection/></d:resourcetype>'),
      ok('/123/calendars/home/', '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Home</d:displayname>'
        + '<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>'
        + '<d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set>'),
      ok('/123/calendars/shared/', '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Team</d:displayname>'
        + '<d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set>'),
      ok('/123/calendars/tasks/', '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Reminders</d:displayname>'
        + '<c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>'),
      ok('/123/calendars/inbox/', '<d:resourcetype><d:collection/><c:schedule-inbox/></d:resourcetype>'),
    ),
    'REPORT https://p42-caldav.icloud.com/123/calendars/home/': ms(
      ok('/123/calendars/home/a.ics', `<d:getetag>"abc"</d:getetag><c:calendar-data>${ICS}</c:calendar-data>`),
      ok('/123/calendars/home/bad.ics', '<d:getetag>"x"</d:getetag><c:calendar-data>not ical</c:calendar-data>'),
    ),
  };
  return (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ method: init.method!, url, auth: headers.authorization });
    const body = routes[`${init.method} ${url}`];
    return new Response(body ?? '', { status: body ? 207 : 404 });
  }) as unknown as typeof fetch;
}

describe('ICloudSource', () => {
  it('finds event calendars through principal discovery', async () => {
    const calls: { method: string; url: string; auth: string }[] = [];
    const source = new ICloudSource('me@icloud.com', 'abcd-efgh', fakeICloud(calls));
    // Shared read-only calendars are listed, marked as not writable.
    expect(await source.listCalendars()).toEqual([
      { remoteId: 'https://p42-caldav.icloud.com/123/calendars/home/', name: 'Home', color: undefined, writable: true },
      { remoteId: 'https://p42-caldav.icloud.com/123/calendars/shared/', name: 'Team', color: undefined, writable: false },
    ]);
    expect(calls[0].auth).toBe(`Basic ${Buffer.from('me@icloud.com:abcd-efgh').toString('base64')}`);
    // The home URL is remembered, so the next listing is one request.
    await source.listCalendars();
    expect(calls).toHaveLength(4);
  });

  it('fetches and expands events, skipping unreadable ones', async () => {
    const source = new ICloudSource('me@icloud.com', 'pw', fakeICloud());
    const events = await source.fetchRange('https://p42-caldav.icloud.com/123/calendars/home/',
      new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'));
    expect(events).toEqual([{
      remoteId: 'https://p42-caldav.icloud.com/123/calendars/home/a.ics', etag: '"abc"', title: 'Swim & snack',
      allDay: false, start: '2026-10-06T16:00:00.000Z', end: '2026-10-06T17:00:00.000Z', location: null,
    }]);
  });

  it('reports a rejected password clearly', async () => {
    const source = new ICloudSource('me@icloud.com', 'wrong', (async () => new Response('', { status: 401 })) as unknown as typeof fetch);
    await expect(source.listCalendars()).rejects.toBeInstanceOf(CalDavAuthError);
  });
});
