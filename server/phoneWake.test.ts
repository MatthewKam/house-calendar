import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';
import { eventId } from './outbox.ts';
import { wakePhones } from './phoneWake.ts';
import type { ApplePusher } from './apns.ts';
import type { PhoneSync } from '../shared/calendars.ts';

const soon = new Date(Date.now() + 2 * 86_400_000);
const at = (h: number) => new Date(soon.getFullYear(), soon.getMonth(), soon.getDate(), h).toISOString();
const TOKEN = 'ab'.repeat(32);

const sent = (over: Partial<PhoneSync> = {}): PhoneSync => ({
	name: "Matt's iPhone",
	calendars: [{ id: 'home', name: 'Home', color: null, account: 'iCloud', primary: true, writable: true }],
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
	],
	wake: { token: TOKEN, sandbox: true },
	...over,
});

function setup() {
	const h = household([{ id: 'matt', name: 'Matt' }], { syncedEdits: { soon: () => {} } });
	const woke: string[] = [];
	const gone = new Set<string>();
	const apple: ApplePusher = {
		async send() {},
		async wake(device, job) {
			if (gone.has(device.token)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
			woke.push(`${device.token.slice(0, 4)}${device.sandbox ? ' (sandbox)' : ''} ${job}`);
		},
	};
	const swimId = () => {
		const cal = (h.db.prepare(`SELECT id FROM calendars WHERE provider = 'phone'`).get() as { id: string }).id;
		return eventId(cal, 'swim');
	};
	const undoPasses = () => h.db.prepare(`UPDATE event_outbox SET send_after = '2000-01-01T00:00:00.000Z'`).run();
	const token = () => (h.db.prepare('SELECT wake_token FROM phones').get() as { wake_token: string | null }).wake_token;
	return { ...h, apple, woke, gone, swimId, undoPasses, token };
}

describe('waking a phone when a change waits for it', () => {
	it('keeps its address with Apple, also when an older build leaves it out', async () => {
		const { call, token } = setup();
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent());
		expect(token()).toBe(TOKEN);
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent({ wake: undefined }));
		expect(token()).toBe(TOKEN);
	});

	it('wakes it once Undo has passed, and not again straight away', async () => {
		const { db, call, apple, woke, swimId, undoPasses } = setup();
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent());
		const last = new Map<string, number>();
		// Nothing waiting: nothing to wake for.
		expect((await wakePhones(db, apple, last)).woken).toEqual([]);

		await call('PATCH', `/api/events/${swimId()}`, { title: 'Swim lesson' });
		expect((await wakePhones(db, apple, last)).woken).toEqual([]); // Undo can still take it back
		undoPasses();
		expect(await wakePhones(db, apple, last)).toEqual({ woken: ['p1'], held: 0 });
		expect(woke).toEqual(['abab (sandbox) calendars']);
		expect(await wakePhones(db, apple, last)).toEqual({ woken: [], held: 1 });
		expect(await wakePhones(db, apple, last, Date.now() + 60_000)).toEqual({ woken: ['p1'], held: 0 });
	});

	it("can't wake a phone that never gave its address, and forgets one Apple says is gone", async () => {
		const { db, call, apple, gone, swimId, undoPasses, token } = setup();
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent({ wake: undefined }));
		await call('PATCH', `/api/events/${swimId()}`, { title: 'Swim lesson' });
		undoPasses();
		expect((await wakePhones(db, apple, new Map())).woken).toEqual([]);

		await call('PUT', '/api/phone-calendars/p1?member=matt', sent());
		gone.add(TOKEN);
		expect((await wakePhones(db, apple, new Map())).woken).toEqual([]);
		expect(token()).toBeNull();
	});
});
