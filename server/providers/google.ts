import type { CalendarSource, EventStore, RemoteCalendar, RemoteEvent } from './types.ts';
import type { Details } from './icalEdit.ts';

// Google Calendar, connected by each person with their own Google account (OAuth): Google asks
// them once to let the app see and change their calendars' events, and the server keeps a refresh
// token to sync with. Edits made on the wall go back through the API (`store`, via outbox.ts).

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';
/** Exactly the scopes registered for Sprig in Google Cloud (Data Access); change both together. */
const EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_SCOPES = [
	EVENTS_SCOPE, // read and change events (not calendars' settings)
	'https://www.googleapis.com/auth/calendar.calendarlist.readonly', // which calendars they have
];
export const SCOPES = ['openid', 'https://www.googleapis.com/auth/userinfo.email', ...CALENDAR_SCOPES];

export interface GoogleOAuth {
	/** Where to send the person to allow access; Google comes back to `redirectUri` with a code. */
	authUrl(redirectUri: string, state: string, loginHint?: string | null): string;
	/** The code from the redirect, for a refresh token and the account's email. */
	exchange(code: string, redirectUri: string): Promise<{ refreshToken: string; account: string }>;
	/** `scope`: what the person allowed (Google says with each token); connections made before Sprig
	 * could change events lack calendar.events. */
	accessToken(refreshToken: string): Promise<{ token: string; expiresAt: number; scope?: string }>;
	revoke(refreshToken: string): Promise<void>;
}

/** Thrown when the person took the app's access away (or it expired): they connect again. */
class AccessRevoked extends Error {}

export function googleOAuth(clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch): GoogleOAuth {
	const post = async (body: Record<string, string>) => {
		const res = await fetchImpl(TOKEN, {
			method: 'POST',
			body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
		});
		const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
		if (json.error === 'invalid_grant') throw new AccessRevoked('Google access was removed or has expired');
		if (!res.ok) throw new Error(`Google sign-in failed: ${json.error_description ?? json.error ?? res.status}`);
		return json;
	};
	return {
		authUrl(redirectUri, state, loginHint) {
			return `${AUTH}?${new URLSearchParams({
				client_id: clientId,
				redirect_uri: redirectUri,
				response_type: 'code',
				scope: SCOPES.join(' '),
				state,
				// offline + consent: a refresh token every time, so syncing keeps working.
				access_type: 'offline',
				prompt: 'consent',
				// No include_granted_scopes: the grant is exactly SCOPES, not ones an older version asked for.
				...(loginHint ? { login_hint: loginHint } : {}),
			})}`;
		},
		async exchange(code, redirectUri) {
			const json = await post({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
			if (typeof json.refresh_token !== 'string') throw new Error('Google gave no refresh token');
			// Google lets people untick each calendar box on its consent screen: both are needed.
			const granted = typeof json.scope === 'string' ? json.scope.split(' ') : null;
			if (granted && !CALENDAR_SCOPES.every((s) => granted.includes(s)))
				throw new Error('Calendar access was not allowed');
			// Straight from Google's token endpoint over HTTPS, so the ID token needn't be checked again.
			const claims = JSON.parse(Buffer.from(String(json.id_token).split('.')[1] ?? '', 'base64url').toString() || '{}');
			return { refreshToken: json.refresh_token, account: String(claims.email ?? 'Google account').toLowerCase() };
		},
		async accessToken(refreshToken) {
			const json = await post({ refresh_token: refreshToken, grant_type: 'refresh_token' });
			return {
				token: String(json.access_token),
				expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
				...(typeof json.scope === 'string' ? { scope: json.scope } : {}),
			};
		},
		async revoke(refreshToken) {
			await fetchImpl(`${REVOKE}?${new URLSearchParams({ token: refreshToken })}`, { method: 'POST' }).catch(() => {});
		},
	};
}

interface GEvent {
	id: string;
	etag: string;
	status?: string;
	summary?: string;
	location?: string;
	description?: string;
	eventType?: string;
	recurringEventId?: string;
	start?: { date?: string; dateTime?: string; timeZone?: string };
	end?: { date?: string; dateTime?: string; timeZone?: string };
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

/** One occurrence's details as the wall compares them (outbox.ts), from Google's event. */
const detailsOf = (e: GEvent): Details | null => {
	const r = toRemoteEvent(e);
	return (
		r && {
			title: r.title,
			allDay: r.allDay,
			start: r.start,
			end: r.end,
			location: r.location ?? null,
			notes: r.notes ?? null,
		}
	);
};

/** A change from the wall in Google's terms. Null clears a field; times say all day or not both ways. */
function toGoogle(c: Partial<Details>): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (c.title !== undefined) body.summary = c.title;
	if (c.location !== undefined) body.location = c.location;
	if (c.notes !== undefined) body.description = c.notes;
	if (c.start !== undefined && c.end !== undefined) {
		const at = (t: string) => (c.allDay ? { date: t, dateTime: null } : { dateTime: t, date: null });
		body.start = at(c.start);
		body.end = at(c.end);
	}
	return body;
}

/** One person's Google calendars, read with their refresh token, and changed from the wall. */
export class GoogleSource implements CalendarSource {
	readonly id = 'google' as const;
	private access: { token: string; expiresAt: number; scope?: string } | null = null;

	constructor(
		readonly key: string,
		readonly memberId: string | null,
		private readonly account: string,
		private readonly refreshToken: string,
		private readonly oauth: GoogleOAuth,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	private fail(what: string, err?: unknown): Error {
		return new Error(`Google Calendar (${this.account}): ${what}`, { cause: err });
	}

	private async token() {
		try {
			if (!this.access || this.access.expiresAt < Date.now() + 60_000)
				this.access = await this.oauth.accessToken(this.refreshToken);
			return this.access;
		} catch (err) {
			throw this.fail(
				err instanceof AccessRevoked ? 'access was removed. Connect it again in Settings.' : (err as Error).message,
				err,
			);
		}
	}

	/** One API call; a refused access token is renewed once. */
	private async call(
		method: string,
		path: string,
		opts: { params?: Record<string, string>; body?: unknown; ifMatch?: string } = {},
		retried = false,
	): Promise<Response> {
		const { token } = await this.token();
		const query = opts.params ? `?${new URLSearchParams(opts.params)}` : '';
		const res = await this.fetchImpl(`${API}${path}${query}`, {
			method,
			headers: {
				authorization: `Bearer ${token}`,
				...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
				...(opts.ifMatch ? { 'if-match': opts.ifMatch } : {}),
			},
			...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
		});
		if (res.status === 401 && !retried) {
			this.access = null;
			return this.call(method, path, opts, true);
		}
		return res;
	}

	/** Throws Google's reason for a refused call. */
	private async check(res: Response) {
		if (res.ok) return;
		const text = (await res.text()).slice(0, 200);
		if (res.status === 403 && /insufficient/i.test(text))
			throw this.fail('Sprig can only read this account. Connect it again in Settings to make changes here.');
		throw this.fail(`${res.status} ${text}`);
	}

	private async get<T>(path: string, params: Record<string, string>): Promise<T> {
		const res = await this.call('GET', path, { params });
		await this.check(res);
		return res.json() as Promise<T>;
	}

	/** Every page of a list. */
	private async all<T>(path: string, params: Record<string, string>): Promise<T[]> {
		const out: T[] = [];
		let pageToken: string | undefined;
		do {
			const page = await this.get<{ items?: T[]; nextPageToken?: string }>(
				path,
				pageToken ? { ...params, pageToken } : params,
			);
			out.push(...(page.items ?? []));
			pageToken = page.nextPageToken;
		} while (pageToken);
		return out;
	}

	async listCalendars(): Promise<RemoteCalendar[]> {
		const list = await this.all<{
			id: string;
			summary?: string;
			summaryOverride?: string;
			backgroundColor?: string;
			primary?: boolean;
			accessRole?: string;
		}>('/users/me/calendarList', { minAccessRole: 'reader', maxResults: '250' });
		// Changes go back only with the events scope (connections from before it was asked for lack it).
		const canChange = !!(await this.token()).scope?.split(' ').includes(EVENTS_SCOPE);
		return list.map((c) => ({
			remoteId: c.id,
			name: c.summaryOverride ?? c.summary ?? c.id,
			color: c.backgroundColor,
			primary: !!c.primary,
			writable: canChange && (c.accessRole === 'owner' || c.accessRole === 'writer'),
		}));
	}

	async fetchRange(calendarRemoteId: string, from: Date, to: Date): Promise<RemoteEvent[]> {
		const items = await this.all<GEvent>(`/calendars/${encodeURIComponent(calendarRemoteId)}/events`, {
			singleEvents: 'true',
			timeMin: from.toISOString(),
			timeMax: to.toISOString(),
			maxResults: '2500',
		});
		return items.map(toRemoteEvent).filter((e): e is RemoteEvent => !!e);
	}

	private path = (calendar: string, eventId?: string) =>
		`/calendars/${encodeURIComponent(calendar)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;

	/**
	 * Asks Google to call `address` whenever this calendar's events change (a "channel"), for about
	 * `ttlSeconds`. Google says each time with the channel's id and `token`, nothing about the change
	 * itself; Sprig then syncs. Null: Google doesn't do this for that calendar (holidays, birthdays).
	 */
	async watch(
		calendar: string,
		channel: { id: string; token: string; address: string; ttlSeconds: number },
	): Promise<{ resourceId: string; expiresAt: number } | null> {
		const res = await this.call('POST', `${this.path(calendar)}/watch`, {
			body: {
				id: channel.id,
				type: 'web_hook',
				address: channel.address,
				token: channel.token,
				params: { ttl: String(channel.ttlSeconds) },
			},
		});
		if (res.status === 400 && /pushNotSupportedForRequestedResource/i.test(await res.clone().text())) return null;
		await this.check(res);
		const json = (await res.json()) as { resourceId?: string; expiration?: string };
		return {
			resourceId: String(json.resourceId),
			expiresAt: Number(json.expiration) || Date.now() + channel.ttlSeconds * 1000,
		};
	}

	/** Stops a channel from watch(); one Google has already let go of is done. */
	async unwatch(channelId: string, resourceId: string) {
		const res = await this.call('POST', '/channels/stop', { body: { id: channelId, resourceId } });
		if (res.status === 404) return;
		await this.check(res);
	}

	/** An event as it is now (with its etag), or null when it's gone. */
	private async event(calendar: string, eventId: string): Promise<GEvent | null> {
		const res = await this.call('GET', this.path(calendar, eventId));
		if (res.status === 404 || res.status === 410) return null;
		await this.check(res);
		const e = (await res.json()) as GEvent;
		return e.status === 'cancelled' ? null : e;
	}

	/** A guarded write: true when done, false when it changed there since (412). */
	private async write(method: 'PATCH' | 'DELETE', calendar: string, eventId: string, etag: string, body?: unknown) {
		const res = await this.call(method, this.path(calendar, eventId), { ifMatch: etag, body });
		if (res.status === 412) return false;
		// Already gone: a delete is done.
		if (method === 'DELETE' && (res.status === 404 || res.status === 410)) return true;
		await this.check(res);
		return true;
	}

	/**
	 * The wall's edits, in Google's terms. One day of a repeat is its instance (the part after '#'); the
	 * series is its main event. A new event is made with the id the outbox gave it, so the sync that
	 * follows finds it under the same id.
	 */
	readonly store: EventStore = {
		create: async (calendar, remoteId, d) => {
			const res = await this.call('POST', this.path(calendar), { body: { id: remoteId, ...toGoogle(d) } });
			// Already made (sent before, but the reply was lost): done.
			if (res.status === 409) return;
			await this.check(res);
		},
		read: async (calendar, remoteId) => {
			const e = await this.event(calendar, remoteId.split('#').pop()!);
			return e && { details: detailsOf(e), version: e.etag };
		},
		update: (calendar, remoteId, version, changes) =>
			this.write('PATCH', calendar, remoteId.split('#').pop()!, version as string, toGoogle(changes)),
		remove: (calendar, remoteId, version) =>
			this.write('DELETE', calendar, remoteId.split('#').pop()!, version as string),
		readSeries: async (calendar, seriesId) => {
			const e = await this.event(calendar, seriesId);
			if (!e) return null;
			const r = toRemoteEvent(e);
			return { details: r && { title: r.title, location: r.location ?? null }, version: e };
		},
		updateSeries: (calendar, seriesId, version, c) => {
			const main = version as GEvent;
			const body: Record<string, unknown> = {};
			if (c.title !== undefined) body.summary = c.title;
			if (c.location !== undefined) body.location = c.location;
			// New times move the series' first day; Google moves the rest with it. All-day series keep their days.
			if ((c.shiftMs || c.durationMs !== undefined) && main.start?.dateTime && main.end?.dateTime) {
				const start = Date.parse(main.start.dateTime) + (c.shiftMs ?? 0);
				const end =
					c.durationMs !== undefined ? start + c.durationMs : Date.parse(main.end.dateTime) + (c.shiftMs ?? 0);
				body.start = { dateTime: new Date(start).toISOString(), timeZone: main.start.timeZone };
				body.end = { dateTime: new Date(end).toISOString(), timeZone: main.end.timeZone };
			}
			return this.write('PATCH', calendar, seriesId, main.etag, body);
		},
		removeSeries: (calendar, seriesId, version) => this.write('DELETE', calendar, seriesId, (version as GEvent).etag),
	};
}
