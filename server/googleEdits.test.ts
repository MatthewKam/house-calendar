import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { syncOnce } from './sync.ts';
import { pushOutbox, SEND_AFTER_MS } from './outbox.ts';
import { GoogleSource, type GoogleOAuth } from './providers/google.ts';

const EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const HOME = 'alex@gmail.com';
const WEEK = 7 * 86_400_000;

type GTime = { date?: string | null; dateTime?: string | null; timeZone?: string };
interface GEv {
	id: string;
	etag: string;
	status?: string;
	summary?: string;
	location?: string | null;
	description?: string | null;
	start: GTime;
	end: GTime;
	recurringEventId?: string;
	/** A series' main event: this many weekly days. */
	weeks?: number;
}

/** A pretend Google Calendar API: events with etags, If-Match on writes, a weekly series and its days. */
function fakeGoogle(opts: { scope?: string; roles?: Record<string, string> } = {}) {
	let n = 0;
	const etag = () => `"${++n}"`;
	const cals: Record<string, Map<string, GEv>> = { [HOME]: new Map(), 'team@group.calendar.google.com': new Map() };
	const add = (cal: string, e: Omit<GEv, 'etag'>) => cals[cal].set(e.id, { ...e, etag: etag() });
	add(HOME, {
		id: 'dentist',
		summary: 'Dentist',
		start: { dateTime: '2026-10-06T16:00:00Z' },
		end: { dateTime: '2026-10-06T17:00:00Z' },
	});
	add(HOME, {
		id: 'soccer',
		summary: 'Soccer',
		start: { dateTime: '2026-10-06T23:00:00Z', timeZone: 'America/Los_Angeles' },
		end: { dateTime: '2026-10-07T00:00:00Z', timeZone: 'America/Los_Angeles' },
		weeks: 4,
	});
	add('team@group.calendar.google.com', {
		id: 'game',
		summary: 'Game',
		start: { date: '2026-10-10' },
		end: { date: '2026-10-11' },
	});
	/** Days of a series changed or cancelled on their own. */
	const exceptions = new Map<string, GEv>();
	const calls: { method: string; path: string; ifMatch?: string; body?: Record<string, unknown> }[] = [];

	const dayId = (main: GEv, i: number) =>
		`${main.id}_${new Date(Date.parse(main.start.dateTime!) + i * WEEK).toISOString().replace(/[-:]|\.000/g, '')}`;
	/** A series' days as Google lists them (singleEvents=true). */
	const days = (main: GEv): GEv[] =>
		Array.from({ length: main.weeks! }, (_, i) => {
			const id = dayId(main, i);
			const at = (t: GTime) => ({ dateTime: new Date(Date.parse(t.dateTime!) + i * WEEK).toISOString() });
			return (
				exceptions.get(id) ?? {
					id,
					etag: main.etag,
					summary: main.summary,
					location: main.location,
					start: at(main.start),
					end: at(main.end),
					recurringEventId: main.id,
				}
			);
		});
	const find = (cal: string, id: string) =>
		cals[cal]?.get(id) ??
		[...(cals[cal]?.values() ?? [])]
			.filter((e) => e.weeks)
			.flatMap(days)
			.find((d) => d.id === id);
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

	const fetchImpl = (async (url: string, init: RequestInit = {}) => {
		const u = new URL(url);
		const path = decodeURIComponent(u.pathname.replace('/calendar/v3', ''));
		const method = init.method ?? 'GET';
		const headers = (init.headers ?? {}) as Record<string, string>;
		const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
		if (method !== 'GET') calls.push({ method, path, ifMatch: headers['if-match'], body });
		if (path === '/users/me/calendarList')
			return json({
				items: Object.keys(cals).map((id) => ({
					id,
					summary: id === HOME ? 'Alex' : 'Team',
					primary: id === HOME,
					accessRole: opts.roles?.[id] ?? (id === HOME ? 'owner' : 'reader'),
				})),
			});
		const [, , cal, , id] = path.split('/');
		if (!id && method === 'GET')
			return json({
				items: [...cals[cal].values()]
					.flatMap((e) => (e.weeks ? days(e) : [e]))
					.filter((e) => e.status !== 'cancelled'),
			});
		if (!id && method === 'POST') {
			if (cals[cal].has(String(body!.id))) return json({ error: 'duplicate' }, 409);
			const made = { ...(body as unknown as GEv), etag: etag() };
			cals[cal].set(made.id, made);
			return json(made);
		}
		const e = find(cal, id);
		if (!e) return json({ error: 'notFound' }, 404);
		if (method === 'GET') return json(e);
		if (headers['if-match'] !== e.etag) return json({ error: 'conditionNotMet' }, 412);
		const keep = (next: GEv) => (cals[cal].has(id) ? cals[cal].set(id, next) : exceptions.set(id, next));
		if (method === 'DELETE') {
			if (cals[cal].has(id)) cals[cal].delete(id);
			else exceptions.set(id, { ...e, status: 'cancelled', etag: etag() });
			return new Response(null, { status: 204 });
		}
		// PATCH: null clears; start and end replace whole.
		const next = { ...e, ...body, etag: etag() } as GEv;
		keep(next);
		return json(next);
	}) as typeof fetch;

	const oauth: GoogleOAuth = {
		authUrl: () => '',
		exchange: async () => ({ refreshToken: 'r', account: HOME }),
		accessToken: async () => ({
			token: 'access',
			expiresAt: Date.now() + 3600_000,
			...(opts.scope === undefined ? { scope: `openid ${EVENTS_SCOPE}` } : opts.scope ? { scope: opts.scope } : {}),
		}),
		revoke: async () => {},
	};
	const source = new GoogleSource('google:1', null, HOME, 'r', oauth, fetchImpl);
	return { cals, exceptions, calls, source, find, dayId, add };
}

async function setup(opts?: Parameters<typeof fakeGoogle>[0]) {
	const db = openDb(':memory:');
	const google = fakeGoogle(opts);
	const now = new Date('2026-10-05T12:00:00Z');
	await syncOnce(db, google.source, now);
	const app = buildApp(db, { syncedEdits: { soon: () => {} } });
	const events = async () =>
		(
			await app.inject({
				url: '/api/events?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z&fromDay=2026-10-01&toDay=2026-11-01',
			})
		).json() as { id: string; title: string; start: string; end: string; syncState: string; calendarId: string }[];
	const send = () => pushOutbox(db, google.source.store, new Date(Date.now() + SEND_AFTER_MS + 1000), 'google:1');
	return { db, app, google, events, send, resync: () => syncOnce(db, google.source, now) };
}

const writableCalendars = (db: ReturnType<typeof openDb>) =>
	db.prepare(`SELECT name, writable FROM calendars WHERE provider = 'google' ORDER BY name`).all();

describe('changing Google events from the wall', () => {
	it('lets the wall change only calendars the person can change, and only once they allowed it', async () => {
		expect(writableCalendars((await setup()).db)).toEqual([
			{ name: 'Alex', writable: 1 },
			{ name: 'Team', writable: 0 },
		]);
		expect(writableCalendars((await setup({ roles: { 'team@group.calendar.google.com': 'writer' } })).db)).toEqual([
			{ name: 'Alex', writable: 1 },
			{ name: 'Team', writable: 1 },
		]);
		// Connected before Sprig asked to change events: read only, and saying so.
		const old = await setup({ scope: 'openid https://www.googleapis.com/auth/calendar.readonly' });
		expect(writableCalendars(old.db)).toEqual([
			{ name: 'Alex', writable: 0 },
			{ name: 'Team', writable: 0 },
		]);
		const dentist = (await old.events()).find((e) => e.title === 'Dentist')!;
		const res = await old.app.inject({ method: 'PATCH', url: `/api/events/${dentist.id}`, payload: { title: 'x' } });
		expect(res.json()).toEqual({ error: 'This event comes from Google Calendar. Change it there.' });
	});

	it('sends an edit after the Undo window, only if Google still has the version the wall changed', async () => {
		const { app, google, events, send, resync } = await setup();
		const dentist = (await events()).find((e) => e.title === 'Dentist')!;
		const res = await app.inject({
			method: 'PATCH',
			url: `/api/events/${dentist.id}`,
			payload: {
				title: 'Dentist (Dr. Lee)',
				location: '1 Main St',
				allDay: true,
				start: '2026-10-07',
				end: '2026-10-08',
			},
		});
		expect(res.json()).toMatchObject({ title: 'Dentist (Dr. Lee)', syncState: 'pending_update' });
		expect(await send()).toEqual({ sent: 1, conflicts: 0, failed: 0 });
		const patch = google.calls.find((c) => c.method === 'PATCH')!;
		expect(patch).toMatchObject({
			path: `/calendars/${HOME}/events/dentist`,
			ifMatch: '"1"',
			body: {
				summary: 'Dentist (Dr. Lee)',
				location: '1 Main St',
				start: { date: '2026-10-07', dateTime: null },
				end: { date: '2026-10-08', dateTime: null },
			},
		});
		await resync();
		expect((await events()).find((e) => e.id === dentist.id)).toMatchObject({
			title: 'Dentist (Dr. Lee)',
			start: '2026-10-07',
			syncState: 'synced',
		});
	});

	it('asks which to keep when the same detail was changed in Google meanwhile', async () => {
		const { app, google, events, send, db } = await setup();
		const dentist = (await events()).find((e) => e.title === 'Dentist')!;
		await app.inject({ method: 'PATCH', url: `/api/events/${dentist.id}`, payload: { title: 'Dentist at 9' } });
		// Changed on someone's phone before the wall's edit went.
		const there = google.cals[HOME].get('dentist')!;
		google.cals[HOME].set('dentist', { ...there, summary: 'Dentist moved', etag: '"99"' });
		expect(await send()).toEqual({ sent: 0, conflicts: 1, failed: 0 });
		expect(google.calls.some((c) => c.method === 'PATCH')).toBe(false);
		expect(db.prepare(`SELECT state FROM event_outbox`).get()).toEqual({ state: 'conflict' });
	});

	it('adds a new event to a Google calendar under the id the wall gave it', async () => {
		const { app, google, events, send, resync, db } = await setup();
		const cal = db.prepare(`SELECT id FROM calendars WHERE name = 'Alex'`).get() as { id: string };
		const made = (
			await app.inject({
				method: 'POST',
				url: '/api/events',
				payload: {
					title: 'Swim',
					allDay: false,
					start: '2026-10-08T17:00:00.000Z',
					end: '2026-10-08T18:00:00.000Z',
					memberIds: [],
					calendarId: cal.id,
				},
			})
		).json() as { id: string; syncState: string };
		expect(made.syncState).toBe('pending_create');
		expect(await send()).toEqual({ sent: 1, conflicts: 0, failed: 0 });
		const post = google.calls.find((c) => c.method === 'POST')!;
		expect(post.body).toMatchObject({
			summary: 'Swim',
			start: { dateTime: '2026-10-08T17:00:00.000Z', date: null },
		});
		expect(post.body!.id).toMatch(/^[0-9a-v]{32}$/);
		// The sync finds it under that id: the same event on the wall, now synced.
		await resync();
		expect((await events()).filter((e) => e.title === 'Swim')).toEqual([
			expect.objectContaining({ id: made.id, syncState: 'synced' }),
		]);
		// Sent twice (the reply was lost): still one.
		expect(await google.source.store.create(HOME, String(post.body!.id), {} as never)).toBeUndefined();
	});

	it('changes or deletes one day of a repeating event, or every day', async () => {
		const { app, google, events, send, resync } = await setup();
		const soccer = (await events()).filter((e) => e.title === 'Soccer');
		expect(soccer).toHaveLength(4);
		// One day off.
		await app.inject({ method: 'DELETE', url: `/api/events/${soccer[1].id}` });
		expect(await send()).toMatchObject({ sent: 1 });
		const day = google.dayId(google.cals[HOME].get('soccer')!, 1);
		expect(google.calls.at(-1)).toMatchObject({ method: 'DELETE', path: `/calendars/${HOME}/events/${day}` });
		await resync();
		expect((await events()).filter((e) => e.title === 'Soccer')).toHaveLength(3);

		// Every day: renamed and an hour later, in the series' own time zone.
		const later = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString();
		await app.inject({
			method: 'PATCH',
			url: `/api/events/${soccer[0].id}`,
			payload: { scope: 'all', title: 'Soccer practice', start: later(soccer[0].start), end: later(soccer[0].end) },
		});
		expect(await send()).toMatchObject({ sent: 1 });
		expect(google.calls.at(-1)).toMatchObject({
			method: 'PATCH',
			path: `/calendars/${HOME}/events/soccer`,
			body: {
				summary: 'Soccer practice',
				start: { dateTime: '2026-10-07T00:00:00.000Z', timeZone: 'America/Los_Angeles' },
				end: { dateTime: '2026-10-07T01:00:00.000Z', timeZone: 'America/Los_Angeles' },
			},
		});

		// And all of it gone.
		await app.inject({ method: 'DELETE', url: `/api/events/${soccer[0].id}?scope=all` });
		expect(await send()).toMatchObject({ sent: 1 });
		expect(google.cals[HOME].has('soccer')).toBe(false);
	});

	it("says what's wrong when Google refuses a change", async () => {
		const { app, google, events, send, db } = await setup();
		const dentist = (await events()).find((e) => e.title === 'Dentist')!;
		await app.inject({ method: 'PATCH', url: `/api/events/${dentist.id}`, payload: { title: 'Dentist!' } });
		// Access taken back to read only in Google's settings meanwhile.
		const fetchImpl = (google.source as unknown as { fetchImpl: typeof fetch }).fetchImpl;
		(google.source as unknown as { fetchImpl: typeof fetch }).fetchImpl = (async (url: string, init?: RequestInit) =>
			init?.method === 'PATCH'
				? new Response('{"error":{"message":"Request had insufficient authentication scopes."}}', { status: 403 })
				: fetchImpl(url, init)) as typeof fetch;
		expect(await send()).toEqual({ sent: 0, conflicts: 0, failed: 1 });
		expect(db.prepare('SELECT error FROM event_outbox').get()).toEqual({
			error: `Google Calendar (${HOME}): Sprig can only read this account. Connect it again in Settings to make changes here.`,
		});
	});
});
