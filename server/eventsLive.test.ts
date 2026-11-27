import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { eventsStamp } from './events.ts';
import { syncOnce } from './sync.ts';
import type { CalendarSource, RemoteEvent } from './providers/types.ts';

const dentist = {
	title: 'Dentist',
	allDay: false,
	start: '2099-01-01T10:00:00.000Z',
	end: '2099-01-01T11:00:00.000Z',
	memberIds: [],
};

/** A pretend calendar account whose events can be changed between syncs. */
function account(events: RemoteEvent[]): CalendarSource {
	return {
		id: 'google',
		key: 'google:c1',
		memberId: null,
		listCalendars: async () => [{ remoteId: 'alex@gmail.com', name: 'Alex' }],
		fetchRange: async () => events,
	} as CalendarSource;
}
const soccer = (title = 'Soccer'): RemoteEvent => ({
	remoteId: 'soccer',
	etag: '1',
	title,
	allDay: false,
	start: '2099-01-02T10:00:00.000Z',
	end: '2099-01-02T11:00:00.000Z',
});

describe('events, live', () => {
	it('answers at once without a stamp, then as soon as an event changes, or after the wait as it is', async () => {
		const db = openDb(':memory:');
		const app = buildApp(db, { liveLists: { waitMs: 300, lookMs: 20 } });
		const live = async (stamp?: string) =>
			(await app.inject({ url: `/api/events/live${stamp ? `?stamp=${stamp}` : ''}` })).json() as { stamp: string };

		const first = await live();
		expect(first.stamp).toMatch(/^[0-9a-f]+$/);
		const asked = Date.now();
		const waiting = live(first.stamp);
		await new Promise((done) => setTimeout(done, 50));
		expect((await app.inject({ method: 'POST', url: '/api/events', payload: dentist })).statusCode).toBe(201);
		const changed = await waiting;
		expect(changed.stamp).not.toBe(first.stamp);
		expect(Date.now() - asked).toBeLessThan(250);
		// Nothing changes: the same stamp back once the wait is over.
		const quiet = Date.now();
		expect((await live(changed.stamp)).stamp).toBe(changed.stamp);
		expect(Date.now() - quiet).toBeGreaterThanOrEqual(280);
		await app.close();
	});

	it("changes with a calendar's events, but not for a sync that brings the same ones again", async () => {
		const db = openDb(':memory:');
		await syncOnce(db, account([soccer()]));
		const before = eventsStamp(db);
		await syncOnce(db, account([soccer()]));
		expect(eventsStamp(db)).toBe(before);
		await syncOnce(db, account([soccer('Soccer at the park')]));
		expect(eventsStamp(db)).not.toBe(before);
		// Hiding the calendar changes what's shown too.
		const after = eventsStamp(db);
		db.prepare('UPDATE calendars SET hidden = 1').run();
		expect(eventsStamp(db)).not.toBe(after);
	});
});
