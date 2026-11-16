import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { schemaOf } from './schemas.ts';
import { addDayKey } from '../shared/days.ts';
import { birthdays, specialDaysBetween, specialEvent, type SpecialDay } from '../shared/specialDays.ts';
import { SpecialReminderNew, type SpecialReminder } from '../shared/specialReminders.ts';

// Reminders on special days: a grown-up taps one on Today (Mom's birthday, Thanksgiving, an event
// marked special) and adds reminders, each with when (on the day, days or weeks before) and what to do
// then ("Pick up a present", "Get flowers"). They're theirs alone, and come round every year. push.ts sends them, at 8 in the morning on each phone's own clock.

interface Row {
	id: string;
	member_id: string | null;
	key: string;
	name: string;
	days_before: number;
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
 * The reminders that come due around `today` (YYYY-MM-DD), each with the day it's for and the day it
 * reminds on. The caller checks each phone's own clock, so a day either side is included.
 */
export function specialRemindersAround(db: DB, today: string, dayOf: (start: string) => string) {
	const rows = db.prepare('SELECT * FROM special_reminders').all() as Row[];
	if (!rows.length) return [];
	// Up to two weeks ahead, for the two-weeks-before ones.
	const days = specialDaysOn(db, addDayKey(today, -1), addDayKey(today, 16), dayOf);
	return rows.flatMap((r) =>
		days
			.filter((d) => d.key === r.key)
			.map((d) => ({ ...r, day: d.day, picture: d.picture, remindOn: addDayKey(d.day, -r.days_before) }))
			.filter((d) => d.remindOn >= addDayKey(today, -1) && d.remindOn <= addDayKey(today, 1)),
	);
}

export function registerSpecialReminders(app: FastifyInstance, db: DB) {
	/** Whose they are: the signed-in grown-up (on your own machine with no sign-in, everyone's are one). */
	const mine = (req: FastifyRequest) => req.raw.viewer?.memberId ?? '';

	app.get('/api/special-reminders', async (req): Promise<SpecialReminder[]> =>
		(
			db
				.prepare(
					`SELECT * FROM special_reminders WHERE COALESCE(member_id, '') = ? ORDER BY days_before DESC, created_at`,
				)
				.all(mine(req)) as Row[]
		).map((r) => ({ id: r.id, key: r.key, daysBefore: r.days_before as SpecialReminder['daysBefore'], note: r.note })),
	);

	app.post<{ Body: SpecialReminderNew }>(
		'/api/special-reminders',
		{ schema: { body: schemaOf(SpecialReminderNew) } },
		async (req, reply) => {
			const viewer = req.raw.viewer;
			if (viewer && viewer.role !== 'guardian') return reply.code(403).send({ error: 'Reminders are for grown-ups' });
			const { key, name, daysBefore, note } = req.body;
			const id = randomUUID();
			db.prepare(
				'INSERT INTO special_reminders (id, member_id, key, name, days_before, note) VALUES (?, ?, ?, ?, ?, ?)',
			).run(id, viewer?.memberId ?? null, key, name, daysBefore, note || null);
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
