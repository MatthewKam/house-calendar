import { describe, expect, it } from 'vitest';
import { sendDue, type Alert, type Pusher } from './push.ts';
import { household } from './testing.ts';

function setup() {
	const sent: Alert[] = [];
	const pusher: Pusher = { publicKey: 'k', send: async (_sub, alert) => void sent.push(alert) };
	const { db, call } = household([{ id: 'alex', name: 'Alex Kim' }], { push: pusher });
	db.prepare(`UPDATE members SET birthdate = '1990-11-26' WHERE id = 'alex'`).run();
	return { db, call, pusher, sent };
}

/** A phone in Los Angeles, with alerts on since long ago. */
async function phone(db: ReturnType<typeof setup>['db'], call: ReturnType<typeof setup>['call']) {
	await call('POST', '/api/push', {
		subscription: { endpoint: 'https://push.test/a', keys: { p256dh: 'p', auth: 'a' } },
		timeZone: 'America/Los_Angeles',
	});
	db.prepare(`UPDATE push_devices SET created_at = '2026-01-01T00:00:00.000Z'`).run();
}

describe('special day reminders', () => {
	it('keeps yours, several on a day, each with what to do, and takes one off', async () => {
		const { call } = setup();
		const add = (daysBefore: number, note?: string) =>
			call('POST', '/api/special-reminders', { key: 'birthday:alex', name: "Alex's birthday", daysBefore, note });
		const present = (await add(7, 'Pick up a present')).body.id as string;
		expect((await add(1, 'Get flowers')).status).toBe(201);
		expect((await add(5)).status).toBe(400);
		expect((await call('GET', '/api/special-reminders')).body).toEqual([
			{ id: present, key: 'birthday:alex', daysBefore: 7, note: 'Pick up a present' },
			{ id: expect.any(String), key: 'birthday:alex', daysBefore: 1, note: 'Get flowers' },
		]);
		expect((await call('DELETE', `/api/special-reminders/${present}`)).status).toBe(204);
		expect((await call('DELETE', `/api/special-reminders/${present}`)).status).toBe(404);
		expect((await call('GET', '/api/special-reminders')).body).toHaveLength(1);
	});

	it('sends a week before a holiday at 8 in the morning, once, and again next year', async () => {
		const { db, call, pusher, sent } = setup();
		await phone(db, call);
		await call('POST', '/api/special-reminders', { key: 'holiday:Thanksgiving', name: 'Thanksgiving', daysBefore: 7 });
		// Thanksgiving 2026 is Thursday 26 November; a week before, 8 AM in Los Angeles, is 16:00 UTC.
		await sendDue(db, pusher, new Date('2026-11-19T15:59:00Z'));
		expect(sent).toEqual([]);
		await sendDue(db, pusher, new Date('2026-11-19T16:01:00Z'));
		await sendDue(db, pusher, new Date('2026-11-19T17:00:00Z'));
		expect(sent).toEqual([
			{ title: '🦃 Thanksgiving is in a week', body: 'Thursday, November 26', url: '/#today', tag: expect.any(String) },
		]);
		// 2027's is the 25th.
		await sendDue(db, pusher, new Date('2027-11-18T16:01:00Z'));
		expect(sent).toHaveLength(2);
	});

	it('sends each of a birthday’s reminders, with what to do', async () => {
		const { db, call, pusher, sent } = setup();
		await phone(db, call);
		const add = (daysBefore: number, note?: string) =>
			call('POST', '/api/special-reminders', { key: 'birthday:alex', name: "Alex's birthday", daysBefore, note });
		await add(7, 'Pick up a present');
		await add(1, 'Get flowers');
		await add(0);
		await sendDue(db, pusher, new Date('2026-11-19T16:01:00Z'));
		await sendDue(db, pusher, new Date('2026-11-25T16:01:00Z'));
		await sendDue(db, pusher, new Date('2026-11-26T16:01:00Z'));
		expect(sent.map((a) => [a.title, a.body])).toEqual([
			["🎂 Alex's birthday is in a week", 'Pick up a present · Thursday, November 26'],
			["🎂 Alex's birthday is tomorrow", 'Get flowers · Thursday, November 26'],
			["🎂 Alex's birthday is today", 'Thursday, November 26'],
		]);
	});

	it('sends the day before an event marked special', async () => {
		const { db, call, pusher, sent } = setup();
		await phone(db, call);
		const ev = await call('POST', '/api/events', {
			title: 'Zoo trip',
			allDay: true,
			start: '2026-12-05',
			end: '2026-12-06',
			memberIds: [],
			special: true,
		});
		expect(ev.status).toBe(201);
		await call('POST', '/api/special-reminders', { key: 'event:Zoo trip', name: 'Zoo trip', daysBefore: 1 });
		await sendDue(db, pusher, new Date('2026-12-04T16:01:00Z'));
		expect(sent.map((a) => a.title)).toEqual(['⭐ Zoo trip is tomorrow']);
	});
});
