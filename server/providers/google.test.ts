import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../db.ts';
import { buildApp } from '../app.ts';
import { syncOnce } from '../sync.ts';
import { GoogleSource, toRemoteEvent, type GoogleOAuth } from './google.ts';
import { googleCalendars } from '../googleSync.ts';
import { sealer } from '../secrets.ts';
import { randomBytes } from 'node:crypto';

const oauth = (tokens: string[] = []): GoogleOAuth => ({
	authUrl: () => 'https://accounts.google.com/x',
	exchange: async () => ({ refreshToken: 'r', account: 'a@gmail.com' }),
	accessToken: async (refresh) => {
		tokens.push(refresh);
		return { token: `access-${tokens.length}`, expiresAt: Date.now() + 3600_000 };
	},
	revoke: async () => {},
});

/** A fake Calendar API: calendars per account, events per calendar, in pages of two. */
function api(
	calendars: Record<string, { id: string; summary: string; primary?: boolean }[]>,
	events: Record<string, object[]>,
) {
	const seen: string[] = [];
	const fetchImpl = (async (url: string, init?: RequestInit) => {
		const u = new URL(url);
		const auth = String((init?.headers as Record<string, string>)?.authorization);
		seen.push(`${u.pathname} ${auth}`);
		const page = Number(u.searchParams.get('pageToken') ?? 0);
		const list = u.pathname.endsWith('/calendarList')
			? (calendars[auth] ?? [])
			: (events[decodeURIComponent(u.pathname.split('/calendars/')[1].replace('/events', ''))] ?? []);
		const items = list.slice(page * 2, page * 2 + 2);
		return new Response(
			JSON.stringify({ items, nextPageToken: list.length > page * 2 + 2 ? String(page + 1) : undefined }),
		);
	}) as typeof fetch;
	return { fetchImpl, seen };
}

describe('Google events', () => {
	it('maps timed, all-day and repeating events, and skips what the wall leaves out', () => {
		expect(
			toRemoteEvent({
				id: 'a',
				etag: 'e',
				summary: ' Swim ',
				location: '1 Pool Rd\nTown',
				description: ' Bring goggles ',
				start: { dateTime: '2026-10-12T09:00:00-07:00' },
				end: { dateTime: '2026-10-12T10:00:00-07:00' },
			}),
		).toEqual({
			remoteId: 'a',
			etag: 'e',
			title: 'Swim',
			allDay: false,
			start: '2026-10-12T16:00:00.000Z',
			end: '2026-10-12T17:00:00.000Z',
			location: '1 Pool Rd, Town',
			notes: 'Bring goggles',
		});
		expect(
			toRemoteEvent({
				id: 'b_20261012',
				recurringEventId: 'b',
				etag: 'e',
				start: { date: '2026-10-12' },
				end: { date: '2026-10-13' },
			}),
		).toMatchObject({
			remoteId: 'b#b_20261012',
			title: '(No title)',
			allDay: true,
			start: '2026-10-12',
			end: '2026-10-13',
		});
		const base = { id: 'c', etag: 'e', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } };
		expect(toRemoteEvent({ ...base, status: 'cancelled' })).toBeNull();
		expect(toRemoteEvent({ ...base, eventType: 'workingLocation' })).toBeNull();
		expect(toRemoteEvent({ ...base, attendees: [{ self: true, responseStatus: 'declined' }] })).toBeNull();
	});

	it("syncs each parent's account, shows a shared calendar once, and links their own calendar to them", async () => {
		const db = openDb(':memory:');
		db.prepare(
			`INSERT INTO members (id, name, color) VALUES ('alex', 'Alex', '#000000'), ('jo', 'Jo', '#000000')`,
		).run();
		const ev = (id: string) => ({
			id,
			etag: id,
			summary: id,
			start: { date: '2026-10-12' },
			end: { date: '2026-10-13' },
		});
		const { fetchImpl } = api(
			{
				'Bearer access-1': [
					{ id: 'alex@gmail.com', summary: 'Alex', primary: true },
					{ id: 'family', summary: 'Family' },
				],
				'Bearer access-2': [
					{ id: 'jo@gmail.com', summary: 'Jo', primary: true },
					{ id: 'family', summary: 'Family' },
				],
			},
			{ 'alex@gmail.com': [ev('a1'), ev('a2'), ev('a3')], 'jo@gmail.com': [ev('j1')], family: [ev('f1')] },
		);
		const tokens: string[] = [];
		const alex = new GoogleSource('google:1', 'alex', 'alex@gmail.com', 'ra', oauth(tokens), fetchImpl);
		const jo = new GoogleSource('google:2', 'jo', 'jo@gmail.com', 'rj', oauth(tokens), fetchImpl);
		const now = new Date('2026-10-12T12:00:00Z');
		expect(await syncOnce(db, alex, now)).toEqual({ calendars: 2, events: 4 });
		expect(await syncOnce(db, jo, now)).toEqual({ calendars: 1, events: 1 });
		// Again: nothing doubles up.
		await syncOnce(db, alex, now);
		await syncOnce(db, jo, now);
		expect(
			db
				.prepare('SELECT name, source, member_id, writable FROM calendars WHERE provider = ? ORDER BY name')
				.all('google'),
		).toEqual([
			{ name: 'Alex', source: 'google:1', member_id: 'alex', writable: 0 },
			{ name: 'Family', source: 'google:1', member_id: null, writable: 0 },
			{ name: 'Jo', source: 'google:2', member_id: 'jo', writable: 0 },
		]);
		expect((db.prepare('SELECT COUNT(*) n FROM events').get() as { n: number }).n).toBe(5);

		// They're shown, but changed in Google Calendar.
		const app = buildApp(db);
		const id = (db.prepare(`SELECT id FROM events WHERE title = 'j1'`).get() as { id: string }).id;
		const res = await app.inject({ method: 'PATCH', url: `/api/events/${id}`, payload: { title: 'x' } });
		expect(res.json()).toEqual({ error: 'This event comes from Google Calendar. Change it there.' });
	});
});

describe('Google connections', () => {
	it('stores the token encrypted, syncs, and takes the calendars away when removed', async () => {
		const db = openDb(':memory:');
		db.prepare(`INSERT INTO members (id, name, color) VALUES ('alex', 'Alex', '#000000')`).run();
		const { fetchImpl } = api(
			{ 'Bearer access-1': [{ id: 'alex@gmail.com', summary: 'Alex', primary: true }] },
			{
				'alex@gmail.com': [
					{ id: 'a1', etag: 'e', summary: 'Dentist', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } },
				],
			},
		);
		const revoked: string[] = [];
		const log = { info: () => {}, error: () => {} };
		const google = googleCalendars(db, {
			oauth: { ...oauth(), revoke: async (t) => void revoked.push(t) },
			sealer: sealer(randomBytes(32)),
			classify: null,
			log,
			fetchImpl,
		});
		google.connect({ memberId: 'alex', account: 'alex@gmail.com', refreshToken: 'secret-refresh' });
		expect(JSON.stringify(db.prepare('SELECT * FROM connections').all())).not.toContain('secret-refresh');
		await vi.waitFor(() =>
			expect(google.list()[0]).toMatchObject({
				account: 'alex@gmail.com',
				memberId: 'alex',
				calendars: 1,
				lastError: null,
			}),
		);
		expect(db.prepare(`SELECT title FROM events`).all()).toEqual([{ title: 'Dentist' }]);

		await google.remove(google.list()[0].id);
		expect(revoked).toEqual(['secret-refresh']);
		expect(db.prepare(`SELECT COUNT(*) n FROM calendars WHERE provider = 'google'`).get()).toEqual({ n: 0 });
		expect(db.prepare(`SELECT COUNT(*) n FROM events`).get()).toEqual({ n: 0 });
		google.stop();
	});
});
