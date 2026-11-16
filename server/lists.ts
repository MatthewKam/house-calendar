import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import type { Viewer } from './auth.ts';
import type { DB } from './db.ts';
import { isDay, noneOrMember, schemaOf } from './schemas.ts';
import {
	ListItemInput,
	ListItemPatch,
	ListName,
	Shopping,
	type LiveLists,
	type SprigItem,
	type SprigList,
} from '../shared/lists.ts';

// Lists kept in Sprig itself: groceries, to-dos, packing. No Reminders Shortcut needed (that's
// reminders.ts, whose lists show beside these). An item can say when (a reminder, due that day or at
// a time) and who it's for. Anyone adds and ticks; naming, deleting and the when and who are a
// parent's (auth.ts).
//
// Shopping together: people shopping from the same list turn it on, and while it's on their phones
// ask /api/lists/live, which answers as soon as anything on the lists changes (a tick on the other
// phone, say) instead of every 30 seconds, so two people don't pick up the same thing.

/** A when: a day (YYYY-MM-DD) or an instant. */
const validDue = (d: string) => isDay(d) || !Number.isNaN(Date.parse(d));

interface ListRow {
	id: string;
	title: string;
	created_at: string;
}
interface ItemRow {
	id: string;
	list_id: string;
	title: string;
	done: number;
	due: string | null;
	member_id: string | null;
	created_at: string;
	done_at: string | null;
	done_by: string | null;
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
const toItem = (r: ItemRow): SprigItem => ({
	id: r.id,
	title: r.title,
	done: r.done === 1,
	due: r.due,
	memberId: r.member_id,
	doneAt: r.done_at,
	doneBy: r.done_at ? r.done_by : null,
});

/** How long Shopping together stays on without being turned on again: a trip to the shops, at most. */
export const SHOPPING_MS = 2 * 60 * 60 * 1000;
/** How long /api/lists/live waits for a change before answering anyway (under the app's 30-second limit). */
const LIVE_WAIT_MS = 20_000;
/** How often it looks while waiting. */
const LIVE_LOOK_MS = 1_000;

/** Who's shopping from each list together, until when: by list id, then member id (null: a device with no one). */
type Shoppers = Map<string, Map<string | null, number>>;

/** Who's shopping from a list now, forgetting anyone whose time ran out. */
function shoppingOn(shoppers: Shoppers, listId: string, now = Date.now()) {
	const on = shoppers.get(listId);
	if (!on) return [];
	for (const [who, until] of on) if (until <= now) on.delete(who);
	return [...on.keys()];
}

/** Every list with its items: open ones oldest first, then done ones, most recently done first. */
function listsOf(db: DB, shoppers: Shoppers): SprigList[] {
	const lists = db.prepare('SELECT * FROM lists ORDER BY created_at').all() as ListRow[];
	const items = db
		.prepare('SELECT * FROM list_items ORDER BY done, CASE WHEN done = 1 THEN done_at END DESC, created_at')
		.all() as ItemRow[];
	return lists.map((l) => ({
		id: l.id,
		title: l.title,
		items: items.filter((i) => i.list_id === l.id).map(toItem),
		shopping: shoppingOn(shoppers, l.id),
	}));
}

/** Its alerts were sent (push.ts): forgotten, so it can alert again. */
const forgetAlerts = (db: DB, itemId: string) =>
	db.prepare(`DELETE FROM push_sent WHERE key LIKE ? ESCAPE '\\'`).run(`item:${itemId.replace(/[\\%_]/g, '\\$&')}:%`);

/** A stamp of how the lists are now: it changes when anything on them does. */
const stampOf = (lists: SprigList[]) => createHash('sha1').update(JSON.stringify(lists)).digest('hex');

/** The member asking (a guardian or kid, or whose PIN unlocked the device), if they're in this family. */
function memberAsking(db: DB, viewer: Viewer | undefined) {
	const id = viewer?.memberId ?? viewer?.actor ?? null;
	return id && db.prepare('SELECT 1 FROM members WHERE id = ?').get(id) ? id : null;
}

export function registerLists(
	app: FastifyInstance,
	db: DB,
	live: { waitMs: number; lookMs: number } = { waitMs: LIVE_WAIT_MS, lookMs: LIVE_LOOK_MS },
) {
	const shoppers: Shoppers = new Map();
	const allLists = () => listsOf(db, shoppers);
	app.get('/api/lists', async () => allLists());

	// Shopping together from a list: on (for SHOPPING_MS, or until it's turned off), or off.
	app.put<{ Params: { id: string }; Body: Shopping }>(
		'/api/lists/:id/shopping',
		{ schema: { body: schemaOf(Shopping) } },
		async (req, reply) => {
			if (!db.prepare('SELECT 1 FROM lists WHERE id = ?').get(req.params.id))
				return reply.code(404).send({ error: 'List not found' });
			const who = memberAsking(db, req.raw.viewer);
			const on = shoppers.get(req.params.id) ?? new Map<string | null, number>();
			if (req.body.on) on.set(who, Date.now() + SHOPPING_MS);
			else on.delete(who);
			shoppers.set(req.params.id, on);
			return allLists();
		},
	);

	// The lists as soon as they're not as the stamp says (straight away if they already aren't), or as
	// they are after LIVE_WAIT_MS. Asked over and over while shopping together.
	app.get<{ Querystring: { stamp?: string } }>('/api/lists/live', async (req, reply): Promise<LiveLists> => {
		const since = req.query.stamp;
		const until = Date.now() + live.waitMs;
		let gone = false;
		// The phone stopped asking (left the page, lost the signal): no answer to wait for.
		reply.raw.on('close', () => (gone = true));
		for (;;) {
			const lists = allLists();
			const stamp = stampOf(lists);
			if (stamp !== since || Date.now() >= until || gone) return { stamp, lists };
			await new Promise((done) => setTimeout(done, live.lookMs));
		}
	});

	app.post<{ Body: ListName }>(
		'/api/lists',
		{
			schema: { body: schemaOf(ListName) },
		},
		async (req, reply) => {
			const title = tidy(req.body.title);
			if (!title) return reply.code(400).send({ error: 'A name is needed' });
			const taken = db.prepare('SELECT 1 FROM lists WHERE title = ? COLLATE NOCASE').get(title);
			if (taken) return reply.code(409).send({ error: 'There is already a list with that name' });
			db.prepare('INSERT INTO lists (id, title) VALUES (?, ?)').run(randomUUID(), title);
			reply.code(201);
			return allLists();
		},
	);

	app.patch<{ Params: { id: string }; Body: ListName }>(
		'/api/lists/:id',
		{
			schema: { body: schemaOf(ListName) },
		},
		async (req, reply) => {
			const title = tidy(req.body.title);
			if (!title) return reply.code(400).send({ error: 'A name is needed' });
			if (db.prepare('SELECT 1 FROM lists WHERE title = ? COLLATE NOCASE AND id != ?').get(title, req.params.id)) {
				return reply.code(409).send({ error: 'There is already a list with that name' });
			}
			if (!db.prepare('UPDATE lists SET title = ? WHERE id = ?').run(title, req.params.id).changes)
				return reply.code(404).send({ error: 'List not found' });
			return allLists();
		},
	);

	app.delete<{ Params: { id: string } }>('/api/lists/:id', async (req, reply) => {
		if (!db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id).changes)
			return reply.code(404).send({ error: 'List not found' });
		return allLists();
	});

	// Done items off the list, for good.
	app.delete<{ Params: { id: string } }>('/api/lists/:id/done', async (req) => {
		db.prepare('DELETE FROM list_items WHERE list_id = ? AND done = 1').run(req.params.id);
		return allLists();
	});

	app.post<{ Params: { id: string }; Body: ListItemInput }>(
		'/api/lists/:id/items',
		{
			schema: { body: schemaOf(ListItemInput) },
		},
		async (req, reply) => {
			const { due, memberId } = req.body;
			const title = tidy(req.body.title);
			if (!title) return reply.code(400).send({ error: 'A name is needed' });
			if (!db.prepare('SELECT 1 FROM lists WHERE id = ?').get(req.params.id))
				return reply.code(404).send({ error: 'List not found' });
			if (due && !validDue(due)) return reply.code(400).send({ error: 'When should be a day or a time' });
			if (!noneOrMember(db, memberId)) return reply.code(400).send({ error: 'Unknown member' });
			db.prepare('INSERT INTO list_items (id, list_id, title, due, member_id) VALUES (?, ?, ?, ?, ?)').run(
				randomUUID(),
				req.params.id,
				title,
				due,
				memberId,
			);
			reply.code(201);
			return allLists();
		},
	);

	// Tick or untick (anyone); rename, when and who (a parent).
	app.patch<{ Params: { id: string }; Body: ListItemPatch }>(
		'/api/lists/items/:id',
		{
			schema: { body: schemaOf(ListItemPatch, { minProperties: 1 }) },
		},
		async (req, reply) => {
			const row = db.prepare('SELECT * FROM list_items WHERE id = ?').get(req.params.id) as ItemRow | undefined;
			if (!row) return reply.code(404).send({ error: 'Item not found' });
			const b = req.body;
			if (b.title !== undefined && !tidy(b.title)) return reply.code(400).send({ error: 'A name is needed' });
			if (b.due && !validDue(b.due)) return reply.code(400).send({ error: 'When should be a day or a time' });
			if (!noneOrMember(db, b.memberId)) return reply.code(400).send({ error: 'Unknown member' });
			const done = b.done ?? row.done === 1;
			// Ticked now: by whoever's asking (kept while it stays ticked).
			const doneBy = done && row.done !== 1 ? memberAsking(db, req.raw.viewer) : done ? row.done_by : null;
			// Unticked: its alert can come again.
			if (!done && row.done === 1) forgetAlerts(db, row.id);
			db.prepare(
				`UPDATE list_items SET title = ?, done = ?, due = ?, member_id = ?, done_by = ?,
      done_at = CASE WHEN ? THEN COALESCE(done_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) END WHERE id = ?`,
			).run(
				b.title !== undefined ? tidy(b.title) : row.title,
				done ? 1 : 0,
				b.due !== undefined ? b.due : row.due,
				b.memberId !== undefined ? b.memberId : row.member_id,
				doneBy,
				done ? 1 : 0,
				row.id,
			);
			return allLists();
		},
	);

	app.delete<{ Params: { id: string } }>('/api/lists/items/:id', async (req, reply) => {
		if (!db.prepare('DELETE FROM list_items WHERE id = ?').run(req.params.id).changes)
			return reply.code(404).send({ error: 'Item not found' });
		forgetAlerts(db, req.params.id);
		return allLists();
	});
}
