import { XMLParser } from 'fast-xml-parser';

// Minimal CalDAV (RFC 4791) over fetch: the PROPFIND and REPORT calls sync needs, plus GET, PUT and
// DELETE of one event for edits made on the wall.

export class CalDavAuthError extends Error {
  constructor() {
    super('iCloud rejected the Apple ID or app-specific password');
  }
}

export interface DavResponse {
  href: string;
  status: number;
  /** Properties from the 200 propstat blocks, namespace prefixes removed. */
  props: Record<string, any>;
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  parseTagValue: false,
  isArray: (name) => ['response', 'propstat', 'href', 'comp'].includes(name),
});

/** Text content of a parsed node, whether or not it had attributes. */
export const text = (v: unknown): string =>
  typeof v === 'string' ? v : v && typeof v === 'object' && '#text' in v ? String((v as any)['#text']) : '';

const statusCode = (s: unknown) => Number(/\s(\d{3})\s/.exec(` ${text(s)} `)?.[1] ?? 200);

export function parseMultistatus(xml: string): DavResponse[] {
  const doc = parser.parse(xml);
  return (doc.multistatus?.response ?? []).map((r: any) => {
    const props: Record<string, any> = {};
    for (const ps of r.propstat ?? []) if (statusCode(ps.status) === 200) Object.assign(props, ps.prop);
    return { href: text(r.href?.[0]), status: r.status ? statusCode(r.status) : 200, props };
  });
}

const NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"';

/** CalDAV wants UTC instants like 20261006T000000Z. */
const davTime = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Whether a privilege set allows adding and changing events; unknown counts as yes. */
function canWrite(set: any): boolean {
  if (!set || typeof set !== 'object') return true;
  const privs = ([] as any[]).concat(set.privilege ?? []);
  if (!privs.length) return true;
  return privs.some((p) => p && typeof p === 'object' && ('all' in p || 'write' in p || 'write-content' in p || 'bind' in p));
}

export class CalDavClient {
  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get auth() {
    return `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
  }

  private async request(method: string, url: string, depth: 0 | 1, body: string): Promise<DavResponse[]> {
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        authorization: this.auth,
        depth: String(depth),
        'content-type': 'application/xml; charset=utf-8',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>${body}`,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 || res.status === 403) throw new CalDavAuthError();
    if (res.status !== 207) throw new Error(`CalDAV ${method} failed: ${res.status} ${res.statusText}`);
    // Relative hrefs resolve against the URL we asked, which may be a different iCloud host.
    return parseMultistatus(await res.text()).map((r) => ({ ...r, href: new URL(r.href, url).href }));
  }

  private async propfind(url: string, depth: 0 | 1, props: string) {
    return this.request('PROPFIND', url, depth,
      `<d:propfind ${NS} xmlns:a="http://apple.com/ns/ical/"><d:prop>${props}</d:prop></d:propfind>`);
  }

  /** Follows current-user-principal, then calendar-home-set, to the URL holding the calendars. */
  async calendarHome(serverUrl: string): Promise<string> {
    const [me] = await this.propfind(serverUrl, 0, '<d:current-user-principal/>');
    const principal = text(me?.props['current-user-principal']?.href?.[0]);
    if (!principal) throw new Error('CalDAV server did not say who we are (no current-user-principal)');
    const principalUrl = new URL(principal, serverUrl).href;
    const [p] = await this.propfind(principalUrl, 0, '<c:calendar-home-set/>');
    const home = text(p?.props['calendar-home-set']?.href?.[0]);
    if (!home) throw new Error('CalDAV server did not return a calendar-home-set');
    return new URL(home, principalUrl).href;
  }

  /** Calendars that hold events (not reminder lists or the inbox). */
  async calendars(homeUrl: string): Promise<{ url: string; name: string; color?: string; writable: boolean }[]> {
    const rows = await this.propfind(homeUrl, 1,
      '<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/><a:calendar-color/><d:current-user-privilege-set/>');
    return rows
      .filter((r) => r.props.resourcetype && typeof r.props.resourcetype === 'object' && 'calendar' in r.props.resourcetype)
      .filter((r) => {
        const comps: any[] | undefined = r.props['supported-calendar-component-set']?.comp;
        return !comps || comps.some((c) => c['@_name'] === 'VEVENT');
      })
      .map((r) => ({
        url: r.href,
        name: text(r.props.displayname) || 'Untitled calendar',
        // Apple sends #RRGGBB or #RRGGBBAA; keep the opaque part.
        color: /^#[0-9a-f]{6}/i.exec(text(r.props['calendar-color']))?.[0].toLowerCase(),
        writable: canWrite(r.props['current-user-privilege-set']),
      }));
  }

  /** One event resource as it is now; null when it's been deleted. */
  async getEvent(href: string): Promise<{ data: string; etag: string } | null> {
    const res = await this.fetchImpl(href, { headers: { authorization: this.auth }, signal: AbortSignal.timeout(30_000) });
    if (res.status === 404 || res.status === 410) return null;
    if (res.status === 401 || res.status === 403) throw new CalDavAuthError();
    if (!res.ok) throw new Error(`CalDAV GET failed: ${res.status} ${res.statusText}`);
    return { data: await res.text(), etag: res.headers.get('etag') ?? '' };
  }

  /**
   * Saves or deletes an event only if it's unchanged since `etag` was read. Returns false when it
   * changed meanwhile (412 Precondition Failed), so the caller can look again. With no etag it
   * creates the event, and false means one is already there.
   */
  async writeEvent(href: string, etag: string, data: string | null): Promise<boolean> {
    const res = await this.fetchImpl(href, {
      method: data === null ? 'DELETE' : 'PUT',
      headers: {
        authorization: this.auth,
        ...(etag ? { 'if-match': etag } : data === null ? {} : { 'if-none-match': '*' }),
        ...(data === null ? {} : { 'content-type': 'text/calendar; charset=utf-8' }),
      },
      body: data ?? undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 412) return false;
    if (res.status === 401) throw new CalDavAuthError();
    if (res.status === 403) throw new Error("iCloud won't let this calendar be changed (it may be shared read-only)");
    // Deleting something already gone is fine.
    if (data === null && res.status === 404) return true;
    if (!res.ok) throw new Error(`CalDAV ${data === null ? 'DELETE' : 'PUT'} failed: ${res.status} ${res.statusText}`);
    return true;
  }

  /** Raw iCalendar resources with at least one occurrence in [from, to). */
  async events(calendarUrl: string, from: Date, to: Date): Promise<{ href: string; etag: string; data: string }[]> {
    const rows = await this.request('REPORT', calendarUrl, 1, `
      <c:calendar-query ${NS}>
        <d:prop><d:getetag/><c:calendar-data/></d:prop>
        <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
          <c:time-range start="${davTime(from)}" end="${davTime(to)}"/>
        </c:comp-filter></c:comp-filter></c:filter>
      </c:calendar-query>`);
    return rows
      .filter((r) => r.status === 200 && r.props['calendar-data'])
      .map((r) => ({ href: r.href, etag: text(r.props.getetag), data: text(r.props['calendar-data']) }));
  }
}
