import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { atLocal, sendDue, sendOnce, type Alert, type Pusher, type Subscription } from './push.ts';
import { household } from './testing.ts';

function setup(withPush = true) {
	const sent: { endpoint: string; alert: Alert }[] = [];
	const gone = new Set<string>();
	const pusher: Pusher = {
		publicKey: 'public-key',
		async send(sub: Subscription, alert: Alert) {
			if (gone.has(sub.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
			sent.push({ endpoint: sub.endpoint, alert });
		},
	};
	const { db, call } = household([{ id: 'alex', name: 'Alex' }], withPush ? { push: pusher } : {});
	return { db, call, pusher, sent, gone };
}

const sub = (n: string, timeZone = 'America/Los_Angeles') => ({
	subscription: { endpoint: `https://push.test/${n}`, keys: { p256dh: 'p', auth: 'a' } },
	timeZone,
});
const devices = (db: ReturnType<typeof openDb>) =>
	db.prepare('SELECT * FROM push_devices ORDER BY endpoint').all() as {
		id: string;
		endpoint: string;
		member_id: string | null;
		time_zone: string;
		subscription: string;
		created_at: string;
	}[];
const alert: Alert = { title: 'Hi', body: 'There', url: '/', tag: 't' };

describe('push', () => {
	it('saves a device, again keeps one, and removes it', async () => {
		const { db, call } = setup();
		expect((await call('GET', '/api/push/key')).body).toEqual({ publicKey: 'public-key' });
		expect((await call('POST', '/api/push', sub('a'))).status).toBe(204);
		expect((await call('POST', '/api/push', sub('a', 'Europe/London'))).status).toBe(204);
		expect(devices(db)).toMatchObject([{ endpoint: 'https://push.test/a', time_zone: 'Europe/London' }]);
		expect((await call('POST', '/api/push', sub('b', 'Mars/Olympus'))).status).toBe(400);
		expect(
			(
				await call('POST', '/api/push', {
					...sub('c'),
					subscription: { endpoint: 'http://push.test/c', keys: { p256dh: 'p', auth: 'a' } },
				})
			).status,
		).toBe(400);
		expect((await call('DELETE', '/api/push', { endpoint: 'https://push.test/a' })).status).toBe(204);
		expect(devices(db)).toEqual([]);
	});

	it('is off without push keys', async () => {
		const { call } = setup(false);
		expect((await call('GET', '/api/push/key')).status).toBe(404);
		expect((await call('POST', '/api/push', sub('a'))).status).toBe(404);
	});

	it('sends each thing once, and forgets devices that are gone', async () => {
		const { db, call, pusher, sent, gone } = setup();
		await call('POST', '/api/push', sub('a'));
		await call('POST', '/api/push', sub('b'));
		gone.add('https://push.test/b');
		await sendOnce(db, pusher, devices(db), 'k1', alert);
		await sendOnce(db, pusher, devices(db), 'k1', alert);
		expect(sent.map((s) => s.endpoint)).toEqual(['https://push.test/a']);
		expect(devices(db).map((d) => d.endpoint)).toEqual(['https://push.test/a']);
	});

	it('finds 8 AM on a day in a time zone, across a clock change', () => {
		expect(new Date(atLocal('2026-07-01', 8, 'America/Los_Angeles')).toISOString()).toBe('2026-07-01T15:00:00.000Z');
		expect(new Date(atLocal('2026-12-01', 8, 'America/Los_Angeles')).toISOString()).toBe('2026-12-01T16:00:00.000Z');
		expect(new Date(atLocal('2026-03-08', 8, 'America/Los_Angeles')).toISOString()).toBe('2026-03-08T15:00:00.000Z');
		expect(new Date(atLocal('2026-07-01', 8, 'Asia/Tokyo')).toISOString()).toBe('2026-06-30T23:00:00.000Z');
	});

	it('sends reminders as they come due, to who they are for, once', async () => {
		const { db, call, pusher, sent } = setup();
		db.prepare(
			`INSERT INTO members (id, name, color) VALUES ('jordan', 'Jordan', '#111111'), ('sam', 'Sam', '#222222')`,
		).run();
		// Sam is a kid.
		await call('PATCH', '/api/members/sam', { birthdate: `${new Date().getFullYear() - 4}-01-01` });
		// Alex's phone and Jordan's phone (made long ago, so nothing is too early for them).
		await call('POST', '/api/push', sub('alex'));
		await call('POST', '/api/push', sub('jordan', 'America/New_York'));
		db.prepare(`UPDATE push_devices SET member_id = ?, created_at = '2000-01-01T00:00:00.000Z' WHERE endpoint = ?`).run(
			'alex',
			'https://push.test/alex',
		);
		db.prepare(`UPDATE push_devices SET member_id = ?, created_at = '2000-01-01T00:00:00.000Z' WHERE endpoint = ?`).run(
			'jordan',
			'https://push.test/jordan',
		);

		const list = (await call('POST', '/api/lists', { title: 'To do' })).body[0];
		const add = async (title: string, due: string, memberId: string | null) =>
			(await call('POST', `/api/lists/${list.id}/items`, { title, due, memberId })).body[0].items.find(
				(i: { title: string }) => i.title === title,
			);
		const dentist = await add('Call the dentist', '2026-07-01T17:00:00.000Z', 'alex');
		await add('Library books', '2026-07-01', null);
		await add("Pack Sam's bag", '2026-07-01T20:00:00.000Z', 'sam');

		const run = async (iso: string) => {
			sent.length = 0;
			await sendDue(db, pusher, new Date(iso));
			return sent.map((s) => `${s.endpoint.slice(18)}: ${s.alert.title} (${s.alert.body})`).sort();
		};
		// 7:59 AM in New York: nothing yet. 8 AM there: the day's reminder, for anyone, on Jordan's phone.
		expect(await run('2026-07-01T11:59:00.000Z')).toEqual([]);
		expect(await run('2026-07-01T12:00:00.000Z')).toEqual(['jordan: ⏰ Library books (To do)']);
		// 8 AM in Los Angeles: on Alex's phone too, and not again on Jordan's.
		expect(await run('2026-07-01T15:00:00.000Z')).toEqual(['alex: ⏰ Library books (To do)']);
		// The dentist is Alex's alone; Sam's bag (a kid's) goes to both grown-ups.
		expect(await run('2026-07-01T17:00:30.000Z')).toEqual(['alex: ⏰ Call the dentist (To do · Alex)']);
		expect(await run('2026-07-01T20:01:00.000Z')).toEqual([
			"alex: ⏰ Pack Sam's bag (To do · Sam)",
			"jordan: ⏰ Pack Sam's bag (To do · Sam)",
		]);
		expect(await run('2026-07-01T20:02:00.000Z')).toEqual([]);

		// Moved to later: it comes again then. Ticked: not at all; unticked: again.
		await call('PATCH', `/api/lists/items/${dentist.id}`, { due: '2026-07-01T21:00:00.000Z' });
		expect(await run('2026-07-01T21:00:00.000Z')).toEqual(['alex: ⏰ Call the dentist (To do · Alex)']);
		await call('PATCH', `/api/lists/items/${dentist.id}`, { done: true });
		await call('PATCH', `/api/lists/items/${dentist.id}`, { due: '2026-07-01T22:00:00.000Z' });
		expect(await run('2026-07-01T22:00:00.000Z')).toEqual([]);
		await call('PATCH', `/api/lists/items/${dentist.id}`, { done: false });
		expect(await run('2026-07-01T22:01:00.000Z')).toEqual(['alex: ⏰ Call the dentist (To do · Alex)']);
	});

	it("doesn't send what came due long ago, or before the phone turned alerts on", async () => {
		const { db, call, pusher, sent } = setup();
		await call('POST', '/api/push', sub('alex'));
		db.prepare(`UPDATE push_devices SET created_at = '2026-07-01T00:00:00.000Z'`).run();
		const list = (await call('POST', '/api/lists', { title: 'To do' })).body[0];
		for (const [title, due] of [
			['Before alerts', '2026-06-30T23:00:00.000Z'],
			['Long ago', '2026-07-01T01:00:00.000Z'],
			['Just now', '2026-07-01T14:00:00.000Z'],
		]) {
			await call('POST', `/api/lists/${list.id}/items`, { title, due });
		}
		await sendDue(db, pusher, new Date('2026-07-01T14:05:00.000Z'));
		expect(sent.map((s) => s.alert.title)).toEqual(['⏰ Just now']);
	});

	it('sends time to leave to who the event is for, once, on their own clock', async () => {
		const { db, call, pusher, sent } = setup();
		db.prepare(`INSERT INTO members (id, name, color) VALUES ('jordan', 'Jordan', '#111111')`).run();
		await call('POST', '/api/push', sub('alex'));
		await call('POST', '/api/push', sub('jordan', 'America/New_York'));
		db.prepare(
			`UPDATE push_devices SET member_id = substr(endpoint, 19), created_at = '2000-01-01T00:00:00.000Z'`,
		).run();
		const leave = async (id: string, remindAt: string, memberIds: string[]) => {
			const ev = (
				await call('POST', '/api/events', {
					title: 'Swim',
					allDay: false,
					start: '2026-07-01T17:00:00.000Z',
					end: '2026-07-01T18:00:00.000Z',
					memberIds,
				})
			).body;
			db.prepare(
				`INSERT INTO leave_alerts (id, event_id, title, destination, arrive_by, drive_minutes, leave_at, remind_at)
        VALUES (?, ?, 'Swim', 'The pool', '2026-07-01T17:00:00.000Z', 20, '2026-07-01T16:40:00.000Z', ?)`,
			).run(id, ev.id, remindAt);
		};
		await leave('a1', '2026-07-01T16:30:00.000Z', ['alex']);
		await leave('a2', '2026-07-01T16:30:00.000Z', []);
		await leave('a3', '2026-07-01T16:31:00.000Z', ['jordan']);
		db.prepare(`UPDATE leave_alerts SET dismissed_at = '2026-07-01T16:00:00.000Z' WHERE id = 'a3'`).run();

		await sendDue(db, pusher, new Date('2026-07-01T16:29:00.000Z'));
		expect(sent).toEqual([]);
		await sendDue(db, pusher, new Date('2026-07-01T16:30:00.000Z'));
		await sendDue(db, pusher, new Date('2026-07-01T16:31:00.000Z'));
		expect(sent.map((s) => `${s.endpoint.slice(18)}: ${s.alert.title} (${s.alert.body})`).sort()).toEqual([
			'alex: 🚗 Time to leave for Swim (Leave by 9:40 AM · 20 min to The pool)',
			'alex: 🚗 Time to leave for Swim (Leave by 9:40 AM · 20 min to The pool)',
			'jordan: 🚗 Time to leave for Swim (Leave by 12:40 PM · 20 min to The pool)',
		]);
		// Too long after it came up: not sent.
		sent.length = 0;
		await leave('a4', '2026-07-01T15:00:00.000Z', []);
		await sendDue(db, pusher, new Date('2026-07-01T16:32:00.000Z'));
		expect(sent).toEqual([]);
	});
});
