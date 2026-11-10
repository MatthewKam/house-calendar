import type { CalendarSource, RemoteCalendar, RemoteEvent } from './types.ts';

// Google Calendar, connected by each person with their own Google account (OAuth): Google asks
// them once to let the app see their calendars, and the server keeps a refresh token to sync with.
// Read-only for now; events are changed in Google Calendar itself.

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.readonly'];

export interface GoogleOAuth {
  /** Where to send the person to allow access; Google comes back to `redirectUri` with a code. */
  authUrl(redirectUri: string, state: string, loginHint?: string | null): string;
  /** The code from the redirect, for a refresh token and the account's email. */
  exchange(code: string, redirectUri: string): Promise<{ refreshToken: string; account: string }>;
  accessToken(refreshToken: string): Promise<{ token: string; expiresAt: number }>;
  revoke(refreshToken: string): Promise<void>;
}

/** Thrown when the person took the app's access away (or it expired): they connect again. */
export class AccessRevoked extends Error {}

export function googleOAuth(clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch): GoogleOAuth {
  const post = async (body: Record<string, string>) => {
    const res = await fetchImpl(TOKEN, { method: 'POST', body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }) });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (json.error === 'invalid_grant') throw new AccessRevoked('Google access was removed or has expired');
    if (!res.ok) throw new Error(`Google sign-in failed: ${json.error_description ?? json.error ?? res.status}`);
    return json;
  };
  return {
    authUrl(redirectUri, state, loginHint) {
      return `${AUTH}?${new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '), state,
        // offline + consent: a refresh token every time, so syncing keeps working.
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
        ...(loginHint ? { login_hint: loginHint } : {}),
      })}`;
    },
    async exchange(code, redirectUri) {
      const json = await post({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
      if (typeof json.refresh_token !== 'string') throw new Error('Google gave no refresh token');
      if (typeof json.scope === 'string' && !json.scope.includes('calendar')) throw new Error('Calendar access was not allowed');
      // Straight from Google's token endpoint over HTTPS, so the ID token needn't be checked again.
      const claims = JSON.parse(Buffer.from(String(json.id_token).split('.')[1] ?? '', 'base64url').toString() || '{}');
      return { refreshToken: json.refresh_token, account: String(claims.email ?? 'Google account').toLowerCase() };
    },
    async accessToken(refreshToken) {
      const json = await post({ refresh_token: refreshToken, grant_type: 'refresh_token' });
      return { token: String(json.access_token), expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000 };
    },
    async revoke(refreshToken) {
      await fetchImpl(`${REVOKE}?${new URLSearchParams({ token: refreshToken })}`, { method: 'POST' }).catch(() => {});
    },
  };
}

interface GEvent {
  id: string; etag: string; status?: string; summary?: string; location?: string; description?: string; eventType?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

/** One Google occurrence as the wall stores it; null for ones it doesn't show. */
export function toRemoteEvent(e: GEvent): RemoteEvent | null {
  if (e.status === 'cancelled' || !e.start || !e.end) return null;
  // Working location and focus time aren't events for the family.
  if (e.eventType === 'workingLocation' || e.eventType === 'focusTime') return null;
  if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null;
  const allDay = !!e.start.date;
  return {
    // Every occurrence of a repeating event shares its series id, the part before '#'.
    remoteId: e.recurringEventId ? `${e.recurringEventId}#${e.id}` : e.id,
    etag: e.etag,
    title: e.summary?.trim() || '(No title)',
    allDay,
    start: allDay ? e.start.date! : new Date(e.start.dateTime!).toISOString(),
    end: allDay ? e.end.date! : new Date(e.end.dateTime!).toISOString(),
    location: e.location?.replace(/\s*\n\s*/g, ', ').trim() || null,
    notes: e.description?.trim() || null,
  };
}

/** One person's Google calendars, read with their refresh token. */
export class GoogleSource implements CalendarSource {
  readonly id = 'google' as const;
  private access: { token: string; expiresAt: number } | null = null;

  constructor(
    readonly key: string,
    readonly memberId: string | null,
    private readonly account: string,
    private readonly refreshToken: string,
    private readonly oauth: GoogleOAuth,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string, params: Record<string, string>, retried = false): Promise<T> {
    try {
      if (!this.access || this.access.expiresAt < Date.now() + 60_000) this.access = await this.oauth.accessToken(this.refreshToken);
    } catch (err) {
      throw new Error(`Google Calendar (${this.account}): ${err instanceof AccessRevoked ? 'access was removed. Connect it again in Settings.' : (err as Error).message}`);
    }
    const res = await this.fetchImpl(`${API}${path}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${this.access.token}` } });
    if (res.status === 401 && !retried) {
      this.access = null;
      return this.get(path, params, true);
    }
    if (!res.ok) throw new Error(`Google Calendar (${this.account}): ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<T>;
  }

  /** Every page of a list. */
  private async all<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.get<{ items?: T[]; nextPageToken?: string }>(path, pageToken ? { ...params, pageToken } : params);
      out.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  async listCalendars(): Promise<RemoteCalendar[]> {
    const list = await this.all<{ id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean }>(
      '/users/me/calendarList', { minAccessRole: 'reader', maxResults: '250' });
    return list.map((c) => ({
      remoteId: c.id, name: c.summaryOverride ?? c.summary ?? c.id, color: c.backgroundColor, primary: !!c.primary,
      writable: false,
    }));
  }

  async fetchRange(calendarRemoteId: string, from: Date, to: Date): Promise<RemoteEvent[]> {
    const items = await this.all<GEvent>(`/calendars/${encodeURIComponent(calendarRemoteId)}/events`, {
      singleEvents: 'true', timeMin: from.toISOString(), timeMax: to.toISOString(), maxResults: '2500',
    });
    return items.map(toRemoteEvent).filter((e): e is RemoteEvent => !!e);
  }
}
