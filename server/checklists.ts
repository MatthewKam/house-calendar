import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';

// What to bring: an event's checklist (the jiu jitsu bag: belt, gi, snack). The list belongs to its
// series (every repeat), like a special mark or a flyer, so it works for synced events too; ticks
// belong to one time it happens (its start), so they start fresh every week.

export interface ChecklistItem {
	id: string;
	title: string;
	picture: string | null;
	done: boolean;
}

/** An event's checklist (alias `e`), in order, with this time's ticks: a JSON array. */
export const CHECKLIST_SQL = `(SELECT json_group_array(json_object('id', c.id, 'title', c.title, 'picture', c.picture,
    'done', EXISTS (SELECT 1 FROM event_checklist_ticks t WHERE t.item_id = c.id AND t.occurrence = e.start)))
  FROM (SELECT * FROM event_checklist c WHERE c.calendar_id = e.calendar_id AND c.series_key = COALESCE(e.series_id, e.id)
    ORDER BY c.sort_order) c)`;

export const toChecklist = (json: string): ChecklistItem[] =>
	(JSON.parse(json) as (Omit<ChecklistItem, 'done'> & { done: number })[]).map((x) => ({ ...x, done: !!x.done }));

/** Takes a deleted wall event's checklist with it (a wall event's series is itself). */
export function dropChecklist(db: DB, eventId: string) {
	db.prepare(`DELETE FROM event_checklist WHERE calendar_id = 'local' AND series_key = ?`).run(eventId);
}

/** Checklist routes; `getEvent` answers with the event as the events routes do. */
export function registerChecklists(app: FastifyInstance, db: DB, getEvent: (id: string) => unknown) {
	const eventOf = (id: string) =>
		db.prepare('SELECT calendar_id, COALESCE(series_id, id) AS key, start FROM events WHERE id = ?').get(id) as
			{ calendar_id: string; key: string; start: string } | undefined;

	// The whole list, in order (every repeat): items kept by id keep their ticks, new ones have none.
	app.put<{ Params: { id: string }; Body: { items: { id?: string; title: string; picture: string | null }[] } }>(
		'/api/events/:id/checklist',
		{
			schema: {
				body: {
					type: 'object',
					required: ['items'],
					additionalProperties: false,
					properties: {
						items: {
							type: 'array',
							maxItems: 30,
							items: {
								type: 'object',
								required: ['title'],
								additionalProperties: false,
								properties: {
									id: { type: 'string' },
									title: { type: 'string', minLength: 1, maxLength: 80 },
									picture: { type: ['string', 'null'], maxLength: 16 },
								},
							},
						},
					},
				},
			},
		},
		async (req, reply) => {
			const ev = eventOf(req.params.id);
			if (!ev) return reply.code(404).send({ error: 'Event not found' });
			const had = new Set(
				(
					db
						.prepare('SELECT id FROM event_checklist WHERE calendar_id = ? AND series_key = ?')
						.all(ev.calendar_id, ev.key) as { id: string }[]
				).map((r) => r.id),
			);
			db.transaction(() => {
				const keep = new Set<string>();
				req.body.items.forEach((item, i) => {
					const title = item.title.trim();
					if (!title) return;
					const picture = item.picture || null;
					if (item.id && had.has(item.id) && !keep.has(item.id)) {
						keep.add(item.id);
						db.prepare('UPDATE event_checklist SET title = ?, picture = ?, sort_order = ? WHERE id = ?').run(
							title,
							picture,
							i,
							item.id,
						);
					} else {
						db.prepare(
							'INSERT INTO event_checklist (id, calendar_id, series_key, title, picture, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
						).run(randomUUID(), ev.calendar_id, ev.key, title, picture, i);
					}
				});
				for (const id of had) if (!keep.has(id)) db.prepare('DELETE FROM event_checklist WHERE id = ?').run(id);
			})();
			return getEvent(req.params.id);
		},
	);

	// Ticked or not, for this time it happens only.
	app.put<{ Params: { id: string; itemId: string }; Body: { done: boolean } }>(
		'/api/events/:id/checklist/:itemId',
		{
			schema: {
				body: {
					type: 'object',
					required: ['done'],
					additionalProperties: false,
					properties: { done: { type: 'boolean' } },
				},
			},
		},
		async (req, reply) => {
			const ev = eventOf(req.params.id);
			const item =
				ev &&
				db
					.prepare('SELECT 1 FROM event_checklist WHERE id = ? AND calendar_id = ? AND series_key = ?')
					.get(req.params.itemId, ev.calendar_id, ev.key);
			if (!ev || !item) return reply.code(404).send({ error: 'Not on this checklist' });
			if (req.body.done)
				db.prepare('INSERT OR IGNORE INTO event_checklist_ticks (item_id, occurrence) VALUES (?, ?)').run(
					req.params.itemId,
					ev.start,
				);
			else
				db.prepare('DELETE FROM event_checklist_ticks WHERE item_id = ? AND occurrence = ?').run(
					req.params.itemId,
					ev.start,
				);
			return getEvent(req.params.id);
		},
	);
}
