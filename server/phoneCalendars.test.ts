import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.ts';
import type { PhoneSync } from '../shared/calendars.ts';

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
