import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';
import { eventId } from './outbox.ts';
import type { PhoneEdit, PhoneSync } from '../shared/calendars.ts';

const people = [
	{ id: 'matt', name: 'Matt' },
	{ id: 'sam', name: 'Sam' },
];
const soon = new Date(Date.now() + 2 * 86_400_000);
const at = (h: number) => new Date(soon.getFullYear(), soon.getMonth(), soon.getDate(), h).toISOString();

type Ev = PhoneSync['events'][number];
const swim = (over: Partial<Ev> = {}): Ev => ({
	calendarId: 'home',
	id: 'swim',
	title: 'Swim',
	allDay: false,
	start: at(9),
	end: at(10),
	location: null,
	notes: null,
	...over,
});
const standup = (n: number, over: Partial<Ev> = {}): Ev => ({
	calendarId: 'home',
	id: `standup#${n}`,
	title: 'Standup',
	allDay: false,
	start: new Date(Date.parse(at(8)) + n * 86_400_000).toISOString(),
	end: new Date(Date.parse(at(9)) + n * 86_400_000).toISOString(),
	location: null,
	notes: null,
	...over,
});

/** What a phone sends: its Home calendar, which it can save to (a newer build) unless `older`. */
const sent = (events: Ev[] = [swim()], older = false): PhoneSync => ({
	name: "Matt's iPhone",
	calendars: [
		{ id: 'home', name: 'Home', color: null, account: 'iCloud', primary: true, ...(older ? {} : { writable: true }) },
	],
	events,
});

function setup() {
	const h = household(people, { syncedEdits: { soon: () => {} } });
	/** The phone sends its calendars; the edits come back. */
	const phoneSends = async (events?: Ev[]) => {
		const res = await h.call('PUT', '/api/phone-calendars/p1?member=matt', sent(events));
		expect(res.status).toBe(200);
		return res.body.edits as PhoneEdit[];
	};
	const results = (body: object[]) => h.call('POST', '/api/phone-calendars/p1/edits', { results: body });
	const calId = () => (h.db.prepare(`SELECT id FROM calendars WHERE provider = 'phone'`).get() as { id: string }).id;
	const idOf = (remoteId: string) => eventId(calId(), remoteId);
	/** Undo's few seconds pass. */
	const undoPasses = () => h.db.prepare(`UPDATE event_outbox SET send_after = '2000-01-01T00:00:00.000Z'`).run();
	const outbox = () =>
		h.db.prepare('SELECT op, remote_id, changes, state, error FROM event_outbox ORDER BY id').all() as {
			op: string;
			remote_id: string;
			changes: string;
			state: string;
			error: string | null;
		}[];
	const event = (remoteId: string) =>
		h.db.prepare('SELECT title, remote_id, sync_state FROM events WHERE remote_id = ?').get(remoteId) as
			{ title: string; remote_id: string; sync_state: string } | undefined;
	return { ...h, phoneSends, results, calId, idOf, undoPasses, outbox, event };
}

describe('changes made in Sprig to a phone calendar', () => {
	it('stay read-only when the phone can’t save them (an older build)', async () => {
		const { call, idOf } = setup();
		await call('PUT', '/api/phone-calendars/p1?member=matt', sent([swim()], true));
		const [cal] = (await call('GET', '/api/calendars')).body as { writable: boolean }[];
		expect(cal.writable).toBe(false);
		expect((await call('PATCH', `/api/events/${idOf('swim')}`, { title: 'Swim lesson' })).status).toBe(409);
	});

	it('wait for the phone after Undo, go back to it, and are done once it says it saved them', async () => {
		const { call, phoneSends, results, idOf, undoPasses, outbox, event } = setup();
		await phoneSends();
		const [cal] = (await call('GET', '/api/calendars')).body as { writable: boolean }[];
		expect(cal.writable).toBe(true);

		expect((await call('PATCH', `/api/events/${idOf('swim')}`, { title: 'Swim lesson' })).status).toBe(200);
		expect(event('swim')?.title).toBe('Swim lesson');
		expect((await call('GET', '/api/outbox')).body).toMatchObject({ waitingOn: ["Matt's iPhone"] });

		// Not while Undo can still take it back.
		expect(await phoneSends()).toEqual([]);
		undoPasses();
		const edits = await phoneSends();
		expect(edits).toEqual([
			{
				id: expect.any(Number),
				op: 'update',
				calendarId: 'home',
				eventId: 'swim',
				series: false,
				changes: { title: 'Swim lesson' },
				version: expect.any(String),
			},
		]);
		// Still shown as changed until the phone has it.
		expect(event('swim')?.title).toBe('Swim lesson');

		const res = await results([{ id: edits[0].id, version: edits[0].version, saved: true }]);
		expect(res.body).toEqual({ saved: 1 });
		expect(outbox()).toEqual([]);
		expect((await call('GET', '/api/outbox')).body).toMatchObject({ waitingOn: [] });
		expect(await phoneSends([swim({ title: 'Swim lesson' })])).toEqual([]);
		expect(event('swim')?.title).toBe('Swim lesson');
	});

	it('become a conflict when the phone changed the same thing', async () => {
		const { call, phoneSends, idOf, undoPasses, outbox } = setup();
		await phoneSends();
		await call('PATCH', `/api/events/${idOf('swim')}`, { title: 'Swim lesson' });
		undoPasses();
		expect(await phoneSends([swim({ title: 'Swim class' })])).toEqual([]);
		expect(outbox()).toMatchObject([{ state: 'conflict' }]);
		const status = (await call('GET', '/api/outbox')).body;
		expect(status.conflicts[0]).toMatchObject({ mine: { title: 'Swim lesson' }, theirs: { title: 'Swim class' } });
	});

	it('are done when the phone already has them (saved, but its answer never came)', async () => {
		const { call, phoneSends, idOf, undoPasses, outbox } = setup();
		await phoneSends();
		await call('PATCH', `/api/events/${idOf('swim')}`, { title: 'Swim lesson' });
		undoPasses();
		expect(await phoneSends([swim({ title: 'Swim lesson' })])).toEqual([]);
		expect(outbox()).toEqual([]);
	});

	it("keep waiting when the phone couldn't save one, and go back to it next time", async () => {
		const { call, phoneSends, results, idOf, undoPasses, outbox } = setup();
		await phoneSends();
		await call('PATCH', `/api/events/${idOf('swim')}`, { title: 'Swim lesson' });
		undoPasses();
		const [edit] = await phoneSends();
		await results([{ id: edit.id, version: edit.version, saved: false, error: 'Calendar is read-only' }]);
		expect(outbox()).toMatchObject([{ state: 'pending', error: 'Calendar is read-only' }]);
		expect(await phoneSends()).toHaveLength(1);
	});

	it('delete on the phone, or are done when it was deleted there already', async () => {
		const { call, phoneSends, results, idOf, undoPasses, outbox } = setup();
		await phoneSends([swim(), standup(0)]);
		await call('DELETE', `/api/events/${idOf('swim')}`);
		await call('DELETE', `/api/events/${idOf('standup#0')}`);
		undoPasses();
		// Standup was deleted on the phone meanwhile; Swim is still there.
		const edits = await phoneSends([swim()]);
		expect(edits).toMatchObject([{ op: 'delete', eventId: 'swim', series: false }]);
		expect(outbox()).toHaveLength(1);
		await results([{ id: edits[0].id, version: edits[0].version, saved: true }]);
		expect(outbox()).toEqual([]);
	});

	it('add new events, which keep who they are for under the id the phone gives them', async () => {
		const { call, phoneSends, results, calId, undoPasses, outbox, event, db } = setup();
		await phoneSends();
		const made = await call('POST', '/api/events', {
			title: 'Dentist',
			allDay: false,
			start: at(14),
			end: at(15),
			calendarId: calId(),
			memberIds: ['sam'],
		});
		expect(made.status).toBe(201);
		undoPasses();
		const [edit] = await phoneSends();
		expect(edit).toMatchObject({ op: 'create', calendarId: 'home', eventId: null, series: false });
		expect(edit.changes).toMatchObject({ title: 'Dentist', allDay: false });

		const onPhone = `DENT-1#${at(14)}`;
		await results([{ id: edit.id, version: edit.version, saved: true, eventId: onPhone }]);
		expect(outbox()).toEqual([]);
		expect(event(onPhone)).toMatchObject({ title: 'Dentist', sync_state: 'synced' });
		const whoFor = () =>
			db.prepare('SELECT member_id FROM event_members WHERE event_id = ?').all(eventId(calId(), onPhone));
		expect(whoFor()).toEqual([{ member_id: 'sam' }]);

		// The phone sends it: still one Dentist, still Sam's.
		const dentist = { ...swim(), id: onPhone, title: 'Dentist', start: at(14), end: at(15) };
		expect(await phoneSends([swim(), dentist])).toEqual([]);
		expect(db.prepare(`SELECT count(*) n FROM events WHERE title = 'Dentist'`).get()).toEqual({ n: 1 });
		expect(whoFor()).toEqual([{ member_id: 'sam' }]);
	});

	it('send a change made while a new event was being saved, as a change to the saved one', async () => {
		const { call, phoneSends, results, calId, undoPasses, outbox } = setup();
		await phoneSends();
		const made = await call('POST', '/api/events', {
			title: 'Dentist',
			allDay: false,
			start: at(14),
			end: at(15),
			calendarId: calId(),
			memberIds: [],
		});
		undoPasses();
		const [edit] = await phoneSends();
		await call('PATCH', `/api/events/${made.body.id}`, { title: 'Dentist (Sam)' });

		const onPhone = `DENT-1#${at(14)}`;
		await results([{ id: edit.id, version: edit.version, saved: true, eventId: onPhone }]);
		expect(outbox()).toMatchObject([{ op: 'update', remote_id: onPhone }]);
		undoPasses();
		const dentist = { ...swim(), id: onPhone, title: 'Dentist', start: at(14), end: at(15) };
		expect(await phoneSends([dentist])).toMatchObject([
			{ op: 'update', eventId: onPhone, changes: { title: 'Dentist (Sam)' } },
		]);
	});

	it('to every day of a repeat, without moving the days twice', async () => {
		const { call, phoneSends, results, idOf, undoPasses, outbox } = setup();
		const days = [standup(0), standup(1)];
		await phoneSends(days);
		const hour = 3_600_000;
		await call('PATCH', `/api/events/${idOf('standup#0')}`, {
			scope: 'all',
			start: new Date(Date.parse(at(8)) + hour).toISOString(),
			end: new Date(Date.parse(at(9)) + hour).toISOString(),
		});
		undoPasses();
		const [edit] = await phoneSends(days);
		expect(edit).toMatchObject({ op: 'update', eventId: 'standup', series: true, changes: { shiftMs: hour } });

		// Moved another hour while the phone was saving the first.
		await call('PATCH', `/api/events/${idOf('standup#0')}`, {
			scope: 'all',
			start: new Date(Date.parse(at(8)) + 2 * hour).toISOString(),
			end: new Date(Date.parse(at(9)) + 2 * hour).toISOString(),
		});
		await results([{ id: edit.id, version: edit.version, saved: true }]);
		expect(JSON.parse(outbox()[0].changes)).toMatchObject({ series: true, shiftMs: hour });
	});

	it('go when the phone stops sharing the calendar', async () => {
		const { call, phoneSends, idOf, outbox } = setup();
		await phoneSends();
		await call('PATCH', `/api/events/${idOf('swim')}`, { title: 'Swim lesson' });
		expect(outbox()).toHaveLength(1);
		await call('PUT', '/api/phone-calendars/p1?member=matt', { ...sent(), calendars: [], events: [] });
		expect(outbox()).toEqual([]);
		expect((await call('GET', '/api/outbox')).body).toMatchObject({ pending: 0, waitingOn: [] });
	});

	it("can't be answered for someone else's phone", async () => {
		const { phoneSends, call } = setup();
		await phoneSends();
		expect((await call('POST', '/api/phone-calendars/nope/edits', { results: [] })).status).toBe(404);
	});
});
