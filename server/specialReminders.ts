import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { schemaOf } from './schemas.ts';
import { addDayKey } from '../shared/days.ts';
import { dateOfKey } from '../shared/dayPlans.ts';
import { birthdays, specialDaysBetween, specialEvent, type SpecialDay } from '../shared/specialDays.ts';
import { SpecialReminderNew, type SpecialReminder } from '../shared/specialReminders.ts';

// Reminders on special days: a grown-up taps one on Today (Mom's birthday, Thanksgiving, an event
// marked special) and adds reminders, each with when (on the day, days or weeks before) and what to do
// then ("Pick up a present", "Get flowers"). They're theirs alone, and come round every year. Any one
// day of the calendar takes them too (its key is date:YYYY-MM-DD), just the once, and so does an event
// (series:…), every time it repeats, also 1 or 2 hours before it starts. push.ts sends them, at 8 in
// the morning on each phone's own clock (or those hours before).

interface Row {
	id: string;
	member_id: string | null;
	key: string;
	name: string;
	days_before: number;
	hours_before: number | null;
	note: string | null;
	created_at: string;
}

/** The special days from one day to another (YYYY-MM-DD): holidays, birthdays and events marked special. */
export function specialDaysOn(db: DB, from: string, to: string, dayOf: (start: string) => string): SpecialDay[] {
	const people = db.prepare('SELECT id, name, birthdate FROM members').all() as {
		id: string;
		name: string;
		birthdate: string | null;
	}[];
	const events = (
		db
			.prepare(
				`SELECT e.title, e.start, e.all_day FROM events e
      WHERE EXISTS (SELECT 1 FROM event_special s WHERE s.calendar_id = e.calendar_id AND s.series_key = COALESCE(e.series_id, e.id))
      AND e.start >= ? AND e.start < ?`,
			)
			.all(addDayKey(from, -1), addDayKey(to, 2)) as { title: string; start: string; all_day: number }[]
	).map((e) => specialEvent(e.all_day ? e.start : dayOf(e.start), e.title));
	return specialDaysBetween(from, to, (year) => [
		...birthdays(people, year),
		...events.filter((d) => d.day.startsWith(`${year}-`)),
	]);
}

/**
 * The reminders that come due around `today` (YYYY-MM-DD), each with the day it's for (and an event's
 * title and start), the day it reminds on, and for hours before an event, when. The caller checks each
 * phone's own clock, so a day either side is included.
 */
export function specialRemindersAround(db: DB, today: string, dayOf: (start: string) => string) {
	const rows = db.prepare('SELECT * FROM special_reminders').all() as Row[];
	if (!rows.length) return [];
	// Up to two weeks ahead, for the two-weeks-before ones.
	const from = addDayKey(today, -1);
	const to = addDayKey(today, 16);
	const days = specialDaysOn(db, from, to, dayOf);
	const series = db.prepare(
		`SELECT title, start, all_day FROM events
    WHERE 'series:' || calendar_id || ':' || COALESCE(series_id, id) = ? AND start >= ? AND start < ?
    ORDER BY start`,
	);
	return rows.flatMap((r) => {
		const date = dateOfKey(r.key);
		const on: { day: string; picture: string; name: string; start?: string; allDay?: boolean }[] = date
			? [{ day: date, picture: '📅', name: r.name }]
			: r.key.startsWith('series:')
				? (series.all(r.key, from, addDayKey(to, 1)) as { title: string; start: string; all_day: number }[]).map(
						(e) => ({
							day: e.all_day ? e.start : dayOf(e.start),
							picture: '📅',
							name: e.title,
							start: e.start,
							allDay: !!e.all_day,
						}),
					)
				: days.filter((d) => d.key === r.key).map((d) => ({ ...d, name: r.name }));
		return on
			.filter((d) => !r.hours_before || (d.start && !d.allDay))
			.map((d) => ({
				...r,
				...d,
				remindOn: r.hours_before ? d.day : addDayKey(d.day, -r.days_before),
				at: r.hours_before && d.start ? Date.parse(d.start) - r.hours_before * 3_600_000 : null,
			}))
			.filter((d) => d.remindOn >= addDayKey(today, -1) && d.remindOn <= addDayKey(today, 1));
	});
}

export function registerSpecialReminders(app: FastifyInstance, db: DB) {
	/** Whose they are: the signed-in grown-up (on your own machine with no sign-in, everyone's are one). */
	const mine = (req: FastifyRequest) => req.raw.viewer?.memberId ?? '';

	app.get('/api/special-reminders', async (req): Promise<SpecialReminder[]> =>
		(
			db
				.prepare(
					`SELECT * FROM special_reminders WHERE COALESCE(member_id, '') = ? ORDER BY days_before DESC, COALESCE(hours_before, 0) DESC, created_at`,
				)
				.all(mine(req)) as Row[]
		).map((r) => ({
			id: r.id,
			key: r.key,
			daysBefore: r.days_before as SpecialReminder['daysBefore'],
			hoursBefore: r.hours_before as SpecialReminder['hoursBefore'],
			note: r.note,
		})),
	);

	app.post<{ Body: SpecialReminderNew }>(
		'/api/special-reminders',
		{ schema: { body: schemaOf(SpecialReminderNew) } },
		async (req, reply) => {
			const viewer = req.raw.viewer;
			if (viewer && viewer.role !== 'guardian') return reply.code(403).send({ error: 'Reminders are for grown-ups' });
			const { key, name, daysBefore, hoursBefore, note } = req.body;
			if (hoursBefore && !key.startsWith('series:'))
				return reply.code(400).send({ error: 'Hours before are for events' });
			const id = randomUUID();
			db.prepare(
				'INSERT INTO special_reminders (id, member_id, key, name, days_before, hours_before, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
			).run(id, viewer?.memberId ?? null, key, name, hoursBefore ? 0 : daysBefore, hoursBefore ?? null, note || null);
			reply.code(201);
			return { id };
		},
	);

	app.delete<{ Params: { id: string } }>('/api/special-reminders/:id', async (req, reply) => {
		const res = db
			.prepare(`DELETE FROM special_reminders WHERE id = ? AND COALESCE(member_id, '') = ?`)
			.run(req.params.id, mine(req));
		return res.changes ? reply.code(204).send() : reply.code(404).send({ error: 'Reminder not found' });
	});
}
