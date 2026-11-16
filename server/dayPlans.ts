import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DB } from './db.ts';
import { schemaOf } from './schemas.ts';
import { DayListInput, DayNoteInput, DayTick, PlanKey, type DayPlans } from '../shared/dayPlans.ts';
import type { ChecklistInput } from '../shared/events.ts';

// A day's plans: a note ("Mom likes tulips") and a list to tick ("Cake, Balloons, Candles"), shared by
// the grown-ups. Kept by key (shared/dayPlans.ts): one day, or a special day every year, whose list
// stays while the ticks belong to the day they were ticked on, so each year starts fresh. Kids' own
// devices don't see them (a present on the list is a surprise); changing them is a parent's (auth.ts).

const Params = z.object({ key: PlanKey });
const ItemParams = z.object({ key: PlanKey, itemId: z.string() });

/** Every day's plans: they're few, so all at once. */
export function dayPlans(db: DB): DayPlans {
	const notes = db.prepare('SELECT key, note FROM day_notes').all() as { key: string; note: string }[];
	const items = db
		.prepare(
			`SELECT l.id, l.key, l.title, l.picture,
        (SELECT json_group_array(t.day) FROM day_list_ticks t WHERE t.item_id = l.id) AS ticked
      FROM day_list l ORDER BY l.key, l.sort_order`,
		)
		.all() as { id: string; key: string; title: string; picture: string | null; ticked: string }[];
	const lists: DayPlans['lists'] = {};
	for (const { key, ticked, ...item } of items) (lists[key] ??= []).push({ ...item, ticked: JSON.parse(ticked) });
	return { notes: Object.fromEntries(notes.map((n) => [n.key, n.note])), lists };
}

export function registerDayPlans(app: FastifyInstance, db: DB) {
	/** Not for a kid's own device. */
	const kidsOwn = (req: FastifyRequest, reply: FastifyReply) =>
		req.raw.viewer?.role === 'kid' ? reply.code(403).send({ error: 'Plans are for grown-ups' }) : null;

	app.get('/api/day-plans', async (req, reply) => kidsOwn(req, reply) ?? dayPlans(db));

	app.put<{ Params: { key: string }; Body: z.infer<typeof DayNoteInput> }>(
		'/api/day-plans/:key/note',
		{ schema: { params: schemaOf(Params), body: schemaOf(DayNoteInput) } },
		async (req, reply) => {
			if (kidsOwn(req, reply)) return reply;
			const note = req.body.note.trim();
			if (note)
				db.prepare(
					`INSERT INTO day_notes (key, note) VALUES (?, ?)
          ON CONFLICT (key) DO UPDATE SET note = excluded.note, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
				).run(req.params.key, note);
			else db.prepare('DELETE FROM day_notes WHERE key = ?').run(req.params.key);
			return dayPlans(db);
		},
	);

	// The whole list, in order: items kept by id keep their ticks, new ones have none.
	app.put<{ Params: { key: string }; Body: ChecklistInput }>(
		'/api/day-plans/:key/list',
		{ schema: { params: schemaOf(Params), body: schemaOf(DayListInput) } },
		async (req, reply) => {
			if (kidsOwn(req, reply)) return reply;
			const { key } = req.params;
			const had = new Set(
				(db.prepare('SELECT id FROM day_list WHERE key = ?').all(key) as { id: string }[]).map((r) => r.id),
			);
			db.transaction(() => {
				const keep = new Set<string>();
				req.body.items.forEach((item, i) => {
					const title = item.title.trim();
					if (!title) return;
					const picture = item.picture || null;
					if (item.id && had.has(item.id) && !keep.has(item.id)) {
						keep.add(item.id);
						db.prepare('UPDATE day_list SET title = ?, picture = ?, sort_order = ? WHERE id = ?').run(
							title,
							picture,
							i,
							item.id,
						);
					} else {
						db.prepare('INSERT INTO day_list (id, key, title, picture, sort_order) VALUES (?, ?, ?, ?, ?)').run(
							randomUUID(),
							key,
							title,
							picture,
							i,
						);
					}
				});
				for (const id of had) if (!keep.has(id)) db.prepare('DELETE FROM day_list WHERE id = ?').run(id);
			})();
			return dayPlans(db);
		},
	);

	// Ticked or not, on that day only.
	app.put<{ Params: { key: string; itemId: string }; Body: DayTick }>(
		'/api/day-plans/:key/list/:itemId',
		{ schema: { params: schemaOf(ItemParams), body: schemaOf(DayTick) } },
		async (req, reply) => {
			if (kidsOwn(req, reply)) return reply;
			const { key, itemId } = req.params;
			if (!db.prepare('SELECT 1 FROM day_list WHERE id = ? AND key = ?').get(itemId, key))
				return reply.code(404).send({ error: 'Not on this list' });
			if (req.body.done)
				db.prepare('INSERT OR IGNORE INTO day_list_ticks (item_id, day) VALUES (?, ?)').run(itemId, req.body.day);
			else db.prepare('DELETE FROM day_list_ticks WHERE item_id = ? AND day = ?').run(itemId, req.body.day);
			return dayPlans(db);
		},
	);
}
