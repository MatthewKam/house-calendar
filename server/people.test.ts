import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { syncOnce } from './sync.ts';
import { namesIn } from './people.ts';
import type { CalendarSource, RemoteEvent } from './providers/types.ts';

const now = new Date('2026-10-06T12:00:00Z');
const ev = (remoteId: string, title: string, day = 6): RemoteEvent => ({
	remoteId,
	etag: '"1"',
	title,
	allDay: false,
	start: `2026-10-${String(day).padStart(2, '0')}T16:00:00.000Z`,
	end: `2026-10-${String(day).padStart(2, '0')}T17:00:00.000Z`,
});
const source = (events: RemoteEvent[]): CalendarSource => ({
	id: 'icloud',
	listCalendars: async () => [{ remoteId: 'cal', name: 'Family' }],
	fetchRange: async () => events,
});

async function setup() {
	const db = openDb(':memory:');
	const app = buildApp(db);
	const add = async (name: string) =>
		JSON.parse((await app.inject({ method: 'POST', url: '/api/members', payload: { name, color: '#2f7de1' } })).body)
			.id as string;
	/** Who the events with this title are for (every copy must agree). */
	const memberOf = (title: string) => {
		const ids = (db.prepare('SELECT id FROM events WHERE title = ?').all(title) as { id: string }[]).map((e) => e.id);
		const people = ids.map((id) =>
			(
				db.prepare('SELECT member_id FROM event_members WHERE event_id = ? ORDER BY member_id').all(id) as {
					member_id: string;
				}[]
			).map((r) => r.member_id),
		);
		expect(new Set(people.map((p) => p.join()))).toHaveLength(1);
		return people[0];
	};
	return { db, app, add, memberOf };
}

const swim = [
	ev('cal/swim.ics#2026-10-06T16:00:00', 'Sam - swim class', 6),
	ev('cal/swim.ics#2026-10-13T16:00:00', 'Sam - swim class', 13),
];

describe('finding family names in a title', () => {
	const family = [
		{ id: 'sam', name: 'Sam' },
		{ id: 'riley', name: 'Riley Kam' },
		{ id: 'jo', name: 'Jo' },
	];
	const named = namesIn(family);
	it.each([
		['Sam - swim class', ['sam']],
		["sam's swim school", ['sam']],
		['SAM SWIM', ['sam']],
		['Riley & Sam swim', ['sam', 'riley']],
		['Sam and Riley: dentist', ['sam', 'riley']],
		['Riley Kam checkup', ['riley']],
		['Play date with Noah & Riley', ['riley']],
		['Swim (Sam)', ['sam']],
		['Samba lesson', []],
		['Jordan’s party', []],
		['Joseph visits', []],
		['AT&T bill', []],
		['', []],
	])('%j → %j', (title, ids) => expect(named(title)).toEqual(ids));

	it('copes with names that look like patterns', () => {
		expect(namesIn([{ id: 'x', name: 'A.J.' }])('A.J. soccer')).toEqual(['x']);
		expect(namesIn([{ id: 'x', name: 'A.J.' }])('AxJx soccer')).toEqual([]);
		expect(namesIn([{ id: 'x', name: '  ' }])('anything')).toEqual([]);
	});
});

describe('assigning people to synced events', () => {
	it('gives every repeat to the person named in the title, and the rest to everyone', async () => {
		const { db, add, memberOf } = await setup();
		const sam = await add('Sam');
		await syncOnce(db, source([...swim, ev('cal/bill.ics', 'AT&T bill')]), now);
		expect(memberOf('Sam - swim class')).toEqual([sam]);
		expect(memberOf('AT&T bill')).toEqual([]);
		// Nothing is stored for them: worked out again from the title each time.
		expect(db.prepare('SELECT count(*) AS n FROM event_people').get()).toEqual({ n: 0 });
	});

	it('keeps assignments when the next sync replaces the events', async () => {
		const { db, add, memberOf } = await setup();
		const sam = await add('Sam');
		await syncOnce(db, source(swim), now);
		await syncOnce(db, source(swim), now);
		expect(memberOf('Sam - swim class')).toEqual([sam]);
	});

	it('sorts again when someone joins or is renamed', async () => {
		const { db, app, add, memberOf } = await setup();
		await add('Sam');
		await syncOnce(db, source([ev('cal/x.ics', 'Riley - soccer')]), now);
		expect(memberOf('Riley - soccer')).toEqual([]);

		const riley = await add('Riley');
		expect(memberOf('Riley - soccer')).toEqual([riley]);

		await app.inject({ method: 'PATCH', url: `/api/members/${riley}`, payload: { name: 'Rye' } });
		expect(memberOf('Riley - soccer')).toEqual([]);
	});

	it('lets a manual pick override the names, including a pick of everyone', async () => {
		const { db, app, add, memberOf } = await setup();
		await add('Sam');
		const riley = await add('Riley');
		await syncOnce(db, source([...swim, ev('cal/beds.ics', 'Make beds')]), now);
		expect(memberOf('Make beds')).toEqual([]);

		const swimId = (
			db.prepare("SELECT id FROM events WHERE title = 'Sam - swim class' LIMIT 1").get() as { id: string }
		).id;
		const res = await app.inject({
			method: 'PUT',
			url: `/api/events/${swimId}/people`,
			payload: { memberIds: [riley] },
		});
		expect(res.statusCode).toBe(200);
		expect(memberOf('Sam - swim class')).toEqual([riley]);

		await add('Jordan');
		await syncOnce(db, source(swim), now);
		expect(memberOf('Sam - swim class')).toEqual([riley]);

		// Picking nobody means everyone, even with Sam in the title.
		await app.inject({ method: 'PUT', url: `/api/events/${swimId}/people`, payload: { memberIds: [] } });
		expect(memberOf('Sam - swim class')).toEqual([]);
	});

	it('rejects unknown people and local events', async () => {
		const { db, app } = await setup();
		await syncOnce(db, source(swim), now);
		const { id } = db.prepare('SELECT id FROM events LIMIT 1').get() as { id: string };
		expect(
			(await app.inject({ method: 'PUT', url: `/api/events/${id}/people`, payload: { memberIds: ['nope'] } }))
				.statusCode,
		).toBe(400);
		const local = JSON.parse(
			(
				await app.inject({
					method: 'POST',
					url: '/api/events',
					payload: {
						title: 'Local',
						allDay: true,
						start: '2026-10-07',
						end: '2026-10-08',
					},
				})
			).body,
		);
		expect(
			(await app.inject({ method: 'PUT', url: `/api/events/${local.id}/people`, payload: { memberIds: [] } }))
				.statusCode,
		).toBe(404);
	});
});

describe('calendars linked to a person', () => {
	it('beats names in the title, and loses to manual picks', async () => {
		const { db, app, add, memberOf } = await setup();
		const sam = await add('Sam');
		const alex = await add('Alex');
		await syncOnce(db, source([...swim, ev('cal/derm.ics', 'Derm Appt')]), now);
		const cal = (db.prepare("SELECT id FROM calendars WHERE provider = 'icloud'").get() as { id: string }).id;

		const { id: dermId } = db.prepare("SELECT id FROM events WHERE title = 'Derm Appt'").get() as { id: string };
		await app.inject({ method: 'PUT', url: `/api/events/${dermId}/people`, payload: { memberIds: [sam] } });

		const res = await app.inject({ method: 'PATCH', url: `/api/calendars/${cal}`, payload: { memberId: alex } });
		expect(res.statusCode).toBe(200);
		expect(memberOf('Sam - swim class')).toEqual([alex]); // the calendar link beats the name in the title
		expect(memberOf('Derm Appt')).toEqual([sam]); // the manual pick beats the calendar link

		// Survives a resync, and unlinking brings the name back.
		await syncOnce(db, source([...swim, ev('cal/derm.ics', 'Derm Appt')]), now);
		expect(memberOf('Sam - swim class')).toEqual([alex]);
		await app.inject({ method: 'PATCH', url: `/api/calendars/${cal}`, payload: { memberId: null } });
		expect(memberOf('Sam - swim class')).toEqual([sam]);

		// Removing the linked person falls back the same way.
		await app.inject({ method: 'PATCH', url: `/api/calendars/${cal}`, payload: { memberId: alex } });
		await app.inject({ method: 'DELETE', url: `/api/members/${alex}` });
		expect(memberOf('Sam - swim class')).toEqual([sam]);
	});

	it('hides a calendar from the wall', async () => {
		const { db, app, add } = await setup();
		await add('Sam');
		await syncOnce(db, source(swim), now);
		const cal = (db.prepare("SELECT id FROM calendars WHERE provider = 'icloud'").get() as { id: string }).id;
		await app.inject({ method: 'PATCH', url: `/api/calendars/${cal}`, payload: { hidden: true } });

		const week = new URLSearchParams({
			from: '2026-10-04T00:00:00.000Z',
			to: '2026-10-11T00:00:00.000Z',
			fromDay: '2026-10-04',
			toDay: '2026-10-11',
		});
		expect(JSON.parse((await app.inject({ url: `/api/events?${week}` })).body)).toEqual([]);

		const [listed] = JSON.parse((await app.inject({ url: '/api/calendars' })).body);
		expect(listed).toMatchObject({ id: cal, name: 'Family', hidden: true, memberId: null, events: 1 });
	});
});

describe('events for several people', () => {
	it('lets titles and manual picks name several people, and survives one of them leaving', async () => {
		const { db, app, add, memberOf } = await setup();
		const riley = await add('Riley');
		const sam = await add('Sam');
		await syncOnce(db, source([ev('cal/swim.ics', 'Riley & Sam swim'), ev('cal/bed.ics', 'Make beds')]), now);
		expect(memberOf('Riley & Sam swim').sort()).toEqual([riley, sam].sort());

		const { id } = db.prepare("SELECT id FROM events WHERE title = 'Make beds'").get() as { id: string };
		const res = await app.inject({
			method: 'PUT',
			url: `/api/events/${id}/people`,
			payload: { memberIds: [sam, riley] },
		});
		expect(JSON.parse(res.body).memberIds).toEqual([riley, sam]); // family order

		// Removing Sam keeps Riley on both.
		await app.inject({ method: 'DELETE', url: `/api/members/${sam}` });
		expect(memberOf('Riley & Sam swim')).toEqual([riley]);
		expect(memberOf('Make beds')).toEqual([riley]);
	});
});
