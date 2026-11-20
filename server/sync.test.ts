import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { REFUSED_PATIENCE_MS, syncError, syncOnce, combineStatus, createSync } from './sync.ts';
import { setRefused } from './handover.ts';
import { CalDavAuthError } from './providers/caldav.ts';
import type { CalendarSource, RemoteCalendar, RemoteEvent } from './providers/types.ts';

function fakeSource(calendars: RemoteCalendar[], events: Record<string, RemoteEvent[]>): CalendarSource {
	return {
		id: 'icloud',
		listCalendars: async () => calendars,
		fetchRange: async (id) => events[id] ?? [],
	};
}

const ev = (remoteId: string, title: string, start = '2026-10-06T16:00:00.000Z'): RemoteEvent => ({
	remoteId,
	etag: '"1"',
	title,
	allDay: false,
	start,
	end: '2026-10-06T17:00:00.000Z',
});

const week = {
	from: '2026-10-04T00:00:00.000Z',
	to: '2026-10-11T00:00:00.000Z',
	fromDay: '2026-10-04',
	toDay: '2026-10-11',
};
const now = new Date('2026-10-06T12:00:00Z');

describe('syncOnce', () => {
	it('stores synced events, replaces them on the next pass, and keeps ids stable', async () => {
		const db = openDb(':memory:');
		const app = buildApp(db);
		const list = async () => JSON.parse((await app.inject({ url: `/api/events?${new URLSearchParams(week)}` })).body);
		await app.inject({
			method: 'POST',
			url: '/api/events',
			payload: {
				title: 'Local',
				allDay: true,
				start: '2026-10-07',
				end: '2026-10-08',
			},
		});

		const home = { remoteId: 'https://x/home/', name: 'Home' };
		await syncOnce(db, fakeSource([home], { [home.remoteId]: [ev('a', 'Swim'), ev('b', 'Piano')] }), now);
		const first = await list();
		expect(first.map((e: any) => e.title).sort()).toEqual(['Local', 'Piano', 'Swim']);

		await syncOnce(db, fakeSource([{ ...home, name: 'Family' }], { [home.remoteId]: [ev('a', 'Swim lesson')] }), now);
		const second = await list();
		expect(second.map((e: any) => e.title).sort()).toEqual(['Local', 'Swim lesson']);
		const id = (evs: any[], t: string) => evs.find((e) => e.title.startsWith(t)).id;
		expect(id(second, 'Swim')).toBe(id(first, 'Swim'));
		expect(db.prepare("SELECT name FROM calendars WHERE provider = 'icloud'").all()).toEqual([{ name: 'Family' }]);

		// A calendar removed from iCloud disappears with its events; local events stay.
		await syncOnce(db, fakeSource([], {}), now);
		expect((await list()).map((e: any) => e.title)).toEqual(['Local']);
	});

	it('leaves stored events alone when a fetch fails', async () => {
		const db = openDb(':memory:');
		const home = { remoteId: 'h', name: 'Home' };
		await syncOnce(db, fakeSource([home], { h: [ev('a', 'Swim')] }), now);
		const failing: CalendarSource = {
			...fakeSource([home], {}),
			fetchRange: async () => {
				throw new Error('offline');
			},
		};
		await expect(syncOnce(db, failing, now)).rejects.toThrow('offline');
		expect(db.prepare('SELECT title FROM events').all()).toEqual([{ title: 'Swim' }]);
	});

	it('refuses to edit or delete synced events', async () => {
		const db = openDb(':memory:');
		const app = buildApp(db);
		await syncOnce(db, fakeSource([{ remoteId: 'h', name: 'Home' }], { h: [ev('a', 'Swim')] }), now);
		const { id } = db.prepare('SELECT id FROM events').get() as { id: string };
		const patch = await app.inject({ method: 'PATCH', url: `/api/events/${id}`, payload: { title: 'X' } });
		const del = await app.inject({ method: 'DELETE', url: `/api/events/${id}` });
		expect([patch.statusCode, del.statusCode]).toEqual([409, 409]);
		expect(JSON.parse(del.body).error).toMatch(/iCloud/);
	});

	it('reports no sync when no account is set up', async () => {
		const res = await buildApp(openDb(':memory:')).inject({ url: '/api/sync' });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.body)).toBeNull();
	});
});

describe('duplicate events', () => {
	it('shows an event that is in two calendars once, keeping the copy that says who it is for', async () => {
		const db = openDb(':memory:');
		const app = buildApp(db);
		const riley = JSON.parse(
			(await app.inject({ method: 'POST', url: '/api/members', payload: { name: 'Riley', color: '#2fa66a' } })).body,
		).id;
		const halloween = (id: string, title: string): RemoteEvent => ({
			remoteId: id,
			etag: '"1"',
			title,
			allDay: true,
			start: '2026-10-08',
			end: '2026-10-09',
		});
		const two: CalendarSource = {
			id: 'icloud',
			listCalendars: async () => [
				{ remoteId: 'a', name: 'Family' },
				{ remoteId: 'b', name: 'Personal' },
			],
			fetchRange: async (id) =>
				id === 'a'
					? [halloween('a/1', 'Halloween'), ev('a/2', 'Swim')]
					: [halloween('b/1', '  halloween '), ev('b/2', 'Swim', '2026-10-07T16:00:00.000Z')],
		};
		await syncOnce(db, two, now);
		// Assign the second calendar's Halloween to Riley; that copy should win.
		const { id } = db.prepare("SELECT id FROM events WHERE remote_id = 'b/1'").get() as { id: string };
		await app.inject({ method: 'PUT', url: `/api/events/${id}/people`, payload: { memberIds: [riley] } });

		const list = JSON.parse((await app.inject({ url: `/api/events?${new URLSearchParams(week)}` })).body);
		const h = list.filter((e: any) => e.title.trim().toLowerCase() === 'halloween');
		expect(h).toHaveLength(1);
		expect(h[0]).toMatchObject({ id, memberIds: [riley] });
		// Same title at different times is not a duplicate.
		expect(list.filter((e: any) => e.title === 'Swim')).toHaveLength(2);
	});
});

describe('sync errors', () => {
	it("says iCloud isn't letting Sprig in for an hour of refusals, then that the password needs making again", () => {
		const now = Date.parse('2026-11-10T23:30:00Z');
		expect(syncError(new CalDavAuthError(), now, now)).toMatch(/isn't letting Sprig in right now/);
		expect(syncError(new CalDavAuthError(), now - REFUSED_PATIENCE_MS + 60_000, now)).toMatch(/right now/);
		expect(syncError(new CalDavAuthError(), now - REFUSED_PATIENCE_MS, now)).toMatch(
			/over an hour.*new app-specific password/,
		);
		// Anything else says what went wrong.
		expect(syncError(new Error('CalDAV PROPFIND failed: 503 Service Unavailable'), null, now)).toBe(
			'CalDAV PROPFIND failed: 503 Service Unavailable',
		);
	});
});

describe('one status for every account', () => {
	it('says each problem once, however many accounts have it', () => {
		const refused = (provider: 'icloud' | 'google') => ({
			provider,
			running: false,
			lastSuccess: null,
			lastError: "iCloud isn't letting Sprig in right now",
			calendars: 0,
			events: 0,
			peopleError: null,
			canWrite: true,
		});
		expect(combineStatus([refused('icloud'), refused('icloud')])?.lastError).toBe(
			"iCloud isn't letting Sprig in right now",
		);
	});
});

describe('a refused password and a phone', () => {
	const quiet = { info: () => {}, error: () => {} };
	const refusing: CalendarSource = {
		id: 'icloud',
		listCalendars: async () => {
			throw new CalDavAuthError();
		},
		fetchRange: async () => [],
	};
	const setup = (phoneSentAgo: number | null) => {
		const db = openDb(':memory:');
		db.prepare(`INSERT INTO members (id, name, color, sort_order) VALUES ('matt', 'Matt', '#000000', 0)`).run();
		if (phoneSentAgo !== null)
			db.prepare(`INSERT INTO phones (id, member_id, name, last_sync) VALUES ('p1', 'matt', 'iPhone', ?)`).run(
				new Date(Date.now() - phoneSentAgo).toISOString(),
			);
		// Refused since before a restart, for two hours: kept in the database.
		setRefused(db, 'icloud', Date.now() - 2 * 3_600_000);
		return db;
	};
	const runOnce = async (db: ReturnType<typeof openDb>, source: CalendarSource) => {
		const sync = createSync(db, source, null, 1e9);
		sync.start(quiet);
		await vi.waitFor(() => expect(sync.status.running).toBe(false));
		sync.stop();
		return sync.status;
	};

	it('says the password was refused for over an hour, counting from before a restart', async () => {
		expect((await runOnce(setup(null), refusing)).lastError).toMatch(/for over an hour/);
	});

	it("says nothing while a phone's copy has the calendars, until the phone goes quiet for a day", async () => {
		expect((await runOnce(setup(60_000), refusing)).lastError).toBeNull();
		expect((await runOnce(setup(2 * 86_400_000), refusing)).lastError).toMatch(/for over an hour/);
	});

	it('takes its calendars back from the phone once it works again, and forgets it was refused', async () => {
		const db = setup(60_000);
		db.prepare(
			`INSERT INTO calendars (id, provider, source, remote_id, name, account) VALUES ('ph', 'phone', 'phone:p1', 'p1:home', 'Home', 'iCloud')`,
		).run();
		db.prepare(
			`INSERT INTO events (id, calendar_id, title, all_day, start, end, series_id) VALUES ('x', 'ph', 'Swim', 0, '2026-10-06T16:00:00.000Z', '2026-10-06T17:00:00.000Z', 'swim')`,
		).run();
		db.prepare(`INSERT INTO event_special (calendar_id, series_key) VALUES ('ph', 'swim')`).run();
		const working = fakeSource([{ remoteId: 'home', name: 'Home' }], { home: [ev('home/swim.ics', 'Swim')] });
		expect((await runOnce(db, working)).lastError).toBeNull();
		expect(db.prepare(`SELECT source FROM calendars WHERE name = 'Home'`).all()).toEqual([{ source: 'icloud' }]);
		expect(db.prepare(`SELECT series_key FROM event_special`).all()).toEqual([{ series_key: 'home/swim.ics' }]);
		expect(db.prepare('SELECT * FROM sync_refused').all()).toEqual([]);
	});
});
