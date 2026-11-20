import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.ts';
import type { PhoneSync } from '../shared/calendars.ts';
import { handOver, matchSeries, setRefused } from './handover.ts';

const people = [
	{ id: 'matt', name: 'Matt' },
	{ id: 'sam', name: 'Sam' },
];
const soon = new Date(Date.now() + 2 * 86_400_000);
const at = (h: number) => new Date(soon.getFullYear(), soon.getMonth(), soon.getDate(), h).toISOString();

const sent = (over: Partial<PhoneSync> = {}): PhoneSync => ({
	name: "Matt's iPhone",
	calendars: [
		{ id: 'home', name: 'Home', color: '#2f7de1', account: 'iCloud', primary: true },
		{ id: 'work', name: 'Work', color: null, account: 'Outlook', primary: false },
	],
	events: [
		{
			calendarId: 'home',
			id: 'swim',
			title: 'Swim',
			allDay: false,
			start: at(9),
			end: at(10),
			location: null,
			notes: null,
		},
		{
			calendarId: 'work',
			id: 'standup#1',
			title: 'Standup',
			allDay: false,
			start: at(8),
			end: at(9),
			location: 'Room\n4',
			notes: null,
		},
	],
	...over,
});

describe('phone calendars', () => {
	it("keep a phone's calendars and events, read-only, its main one linked to its person", async () => {
		const { call } = household(people);
		const put = await call('PUT', '/api/phone-calendars/p1?member=matt', sent());
		expect(put.status).toBe(200);
		expect(put.body).toMatchObject({ id: 'p1', memberId: 'matt', name: "Matt's iPhone", calendars: 2, events: 2 });

		const cals = (await call('GET', '/api/calendars')).body as {
			name: string;
			provider: string;
			memberId: string | null;
			writable: boolean;
		}[];
		expect(cals.map((c) => [c.name, c.provider, c.memberId, c.writable])).toEqual([
			['Home', 'phone', 'matt', false],
			['Work', 'phone', null, false],
		]);
		const events = (
			await call(
				'GET',
				`/api/events?from=${at(0)}&to=${at(23)}&fromDay=${at(0).slice(0, 10)}&toDay=${at(23).slice(0, 10)}`,
			)
		).body as { title: string; location: string | null }[];
		expect(events.map((e) => e.title).sort()).toEqual(['Standup', 'Swim']);
		expect(events.find((e) => e.title === 'Standup')?.location).toBe('Room, 4');
	});

	it('replace what the phone sent before, and drop calendars it stops sharing', async () => {
		const { call } = household(people);
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent());
		await call(
			'PUT',
			'/api/phone-calendars/p1?member=matt',
			sent({ calendars: sent().calendars.slice(0, 1), events: [] }),
		);
		const cals = (await call('GET', '/api/calendars')).body as { name: string; events: number }[];
		expect(cals).toMatchObject([{ name: 'Home', events: 0 }]);
	});

	it("leave out a phone's iCloud calendars once that person connects iCloud by password", async () => {
		const { db, call } = household(people);
		db.prepare(
			`INSERT INTO connections (id, provider, member_id, account, token) VALUES ('c', 'icloud', 'matt', 'm@x', 't')`,
		).run();
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent());
		expect(((await call('GET', '/api/calendars')).body as { name: string }[]).map((c) => c.name)).toEqual(['Work']);
	});

	it("take over a refused password's calendars, with what's kept about each event, and give them back", async () => {
		const { db, call } = household(people);
		db.prepare(
			`INSERT INTO connections (id, provider, member_id, account, token) VALUES ('c', 'icloud', 'matt', 'm@x', 't')`,
		).run();
		// The password's copy of Home, with Swim (a different id there) and what Sprig keeps about it.
		const passwordCopy = () => {
			db.prepare(
				`INSERT INTO calendars (id, provider, source, remote_id, name, hidden, visibility) VALUES ('pw', 'icloud', 'icloud:c', 'https://x/home/', 'Home', 0, 'busy')`,
			).run();
			db.prepare(
				`INSERT INTO events (id, calendar_id, title, all_day, start, end, series_id) VALUES ('e1', 'pw', 'Swim', 0, ?, ?, 'https://x/home/swim.ics')`,
			).run(at(9), at(10));
		};
		passwordCopy();
		const series = 'https://x/home/swim.ics';
		db.prepare(`INSERT INTO event_special (calendar_id, series_key) VALUES ('pw', ?)`).run(series);
		db.prepare(
			`INSERT INTO event_checklist (id, calendar_id, series_key, title, sort_order) VALUES ('k1', 'pw', ?, 'Goggles', 0)`,
		).run(series);
		db.prepare(`INSERT INTO special_reminders (id, member_id, key, name) VALUES ('r1', 'matt', ?, 'Swim')`).run(
			`series:pw:${series}`,
		);
		const kept = () => ({
			checklist: db.prepare(`SELECT calendar_id c, series_key s FROM event_checklist`).get(),
			special: db.prepare(`SELECT calendar_id c, series_key s FROM event_special`).get(),
			reminder: (db.prepare(`SELECT key FROM special_reminders`).get() as { key: string }).key,
		});
		const names = async () => ((await call('GET', '/api/calendars')).body as { name: string }[]).map((c) => c.name);

		// Refused, but not for an hour yet: the password's copy stays.
		setRefused(db, 'icloud:c', Date.now() - 10 * 60_000);
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent());
		expect(kept().checklist).toEqual({ c: 'pw', s: series });

		// Refused for over an hour: the phone's Home takes over, and Swim's things go with it.
		db.prepare('DELETE FROM sync_refused').run();
		setRefused(db, 'icloud:c', Date.now() - 2 * 3_600_000);
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent());
		const home = db
			.prepare(`SELECT id, visibility FROM calendars WHERE source = 'phone:p1' AND name = 'Home'`)
			.get() as {
			id: string;
			visibility: string;
		};
		expect(await names()).toEqual(['Home', 'Work']);
		expect(home.visibility).toBe('busy');
		expect(kept()).toEqual({
			checklist: { c: home.id, s: 'swim' },
			special: { c: home.id, s: 'swim' },
			reminder: `series:${home.id}:swim`,
		});

		// The password works again: its copy takes everything back from the phone's.
		setRefused(db, 'icloud:c', null);
		passwordCopy();
		handOver(db, 'phone:p1', ['icloud:c']);
		expect(kept()).toEqual({
			checklist: { c: 'pw', s: series },
			special: { c: 'pw', s: series },
			reminder: `series:pw:${series}`,
		});
		expect((await names()).sort()).toEqual(['Home', 'Work']);
	});

	it("tell two events apart by when they start, and leave out a phone's calendars that aren't iCloud", () => {
		const { db } = household(people);
		db.prepare(`INSERT INTO calendars (id, provider, source, name) VALUES ('a', 'icloud', 'icloud', 'Home')`).run();
		db.prepare(
			`INSERT INTO calendars (id, provider, source, name, account) VALUES ('b', 'phone', 'phone:p', 'Home', 'iCloud')`,
		).run();
		db.prepare(
			`INSERT INTO calendars (id, provider, source, name, account) VALUES ('c', 'phone', 'phone:p', 'Home', 'On My iPhone')`,
		).run();
		const ev = db.prepare(
			`INSERT INTO events (id, calendar_id, title, all_day, start, end, series_id) VALUES (?, ?, ?, 0, ?, ?, ?)`,
		);
		ev.run('a1', 'a', 'Dentist', at(9), at(10), 'a-9');
		ev.run('a2', 'a', 'Dentist', at(15), at(16), 'a-15');
		ev.run('b1', 'b', 'Dentist', at(15), at(16), 'b-15');
		ev.run('b2', 'b', 'Dentist', at(9), at(10), 'b-9');
		expect(matchSeries(db, 'a', 'b').sort()).toEqual([
			['a-15', 'b-15'],
			['a-9', 'b-9'],
		]);
		// Only the phone's iCloud Home is the same calendar.
		expect(handOver(db, 'phone:p', ['icloud'])).toBe(2);
		expect(db.prepare(`SELECT id FROM calendars WHERE id IN ('a', 'b', 'c') ORDER BY id`).all()).toEqual([
			{ id: 'a' },
			{ id: 'c' },
		]);
	});

	it('belong to one person, and go away when they stop sharing', async () => {
		const { call } = household(people);
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent());
		expect((await call('PUT', '/api/phone-calendars/p1?member=sam', sent())).status).toBe(403);
		expect((await call('PUT', '/api/phone-calendars/p2', sent())).status).toBe(403);
		expect((await call('DELETE', '/api/phone-calendars/p1')).status).toBe(204);
		expect((await call('GET', '/api/calendars')).body).toEqual([]);
		expect((await call('GET', '/api/phone-calendars')).body).toEqual([]);
	});

	it("upgrading the calendars table keeps every calendar's events", () => {
		const latest = openDb(':memory:').pragma('user_version', { simple: true }) as number;
		const file = join(mkdtempSync(join(tmpdir(), 'sprig-')), 'calendar.db');
		const before = openDb(file, latest - 1);
		before
			.prepare(
				`INSERT INTO events (id, calendar_id, title, start, end) VALUES ('e', 'local', 'Dinner', '2030-01-01', '2030-01-02')`,
			)
			.run();
		before.close();
		const after = openDb(file);
		expect(after.prepare('SELECT title FROM events').all()).toEqual([{ title: 'Dinner' }]);
		expect(after.pragma('foreign_keys', { simple: true })).toBe(1);
	});
});
