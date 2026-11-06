import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';

// Lists kept in Sprig itself: groceries, to-dos, packing. No Reminders Shortcut needed (that's
// reminders.ts, whose lists show beside these). An item can say when (a reminder, due that day or at
// a time) and who it's for. Anyone adds and ticks; naming, deleting and the when and who are a
// parent's (auth.ts).

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A when: a day (YYYY-MM-DD) or an instant. */
const validDue = (d: string) => DAY.test(d) || !Number.isNaN(Date.parse(d));
const TITLE = { type: 'string', minLength: 1, maxLength: 300 } as const;
const DUE = { type: ['string', 'null'], maxLength: 40 } as const;
const MEMBER = { type: ['string', 'null'] } as const;

interface ListRow { id: string; title: string; created_at: string }
interface ItemRow { id: string; list_id: string; title: string; done: number; due: string | null; member_id: string | null; created_at: string; done_at: string | null }

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
const toItem = (r: ItemRow) => ({ id: r.id, title: r.title, done: r.done === 1, due: r.due, memberId: r.member_id, doneAt: r.done_at });

/** Every list with its items: open ones oldest first, then done ones, most recently done first. */
export function allLists(db: DB) {
  const lists = db.prepare('SELECT * FROM lists ORDER BY created_at').all() as ListRow[];
  const items = db.prepare('SELECT * FROM list_items ORDER BY done, CASE WHEN done = 1 THEN done_at END DESC, created_at').all() as ItemRow[];
  return lists.map((l) => ({ id: l.id, title: l.title, items: items.filter((i) => i.list_id === l.id).map(toItem) }));
}

/** Its alerts were sent (push.ts): forgotten, so it can alert again. */
const forgetAlerts = (db: DB, itemId: string) => db.prepare(`DELETE FROM push_sent WHERE key LIKE ? ESCAPE '\\'`)
  .run(`item:${itemId.replace(/[\\%_]/g, '\\$&')}:%`);

export function registerLists(app: FastifyInstance, db: DB) {
  const memberOk = (id: string | null | undefined) => !id || !!db.prepare('SELECT 1 FROM members WHERE id = ?').get(id);

  app.get('/api/lists', async () => allLists(db));

  app.post<{ Body: { title: string } }>('/api/lists', {
    schema: { body: { type: 'object', required: ['title'], additionalProperties: false, properties: { title: { ...TITLE, maxLength: 100 } } } },
  }, async (req, reply) => {
    const title = tidy(req.body.title);
    if (!title) return reply.code(400).send({ error: 'A name is needed' });
    const taken = db.prepare('SELECT 1 FROM lists WHERE title = ? COLLATE NOCASE').get(title);
    if (taken) return reply.code(409).send({ error: 'There is already a list with that name' });
    db.prepare('INSERT INTO lists (id, title) VALUES (?, ?)').run(randomUUID(), title);
    reply.code(201);
    return allLists(db);
  });

  app.patch<{ Params: { id: string }; Body: { title: string } }>('/api/lists/:id', {
    schema: { body: { type: 'object', required: ['title'], additionalProperties: false, properties: { title: { ...TITLE, maxLength: 100 } } } },
  }, async (req, reply) => {
    const title = tidy(req.body.title);
    if (!title) return reply.code(400).send({ error: 'A name is needed' });
    if (db.prepare('SELECT 1 FROM lists WHERE title = ? COLLATE NOCASE AND id != ?').get(title, req.params.id)) {
      return reply.code(409).send({ error: 'There is already a list with that name' });
    }
    if (!db.prepare('UPDATE lists SET title = ? WHERE id = ?').run(title, req.params.id).changes) return reply.code(404).send({ error: 'List not found' });
    return allLists(db);
  });

  app.delete<{ Params: { id: string } }>('/api/lists/:id', async (req, reply) => {
    if (!db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id).changes) return reply.code(404).send({ error: 'List not found' });
    return allLists(db);
  });

  // Done items off the list, for good.
  app.delete<{ Params: { id: string } }>('/api/lists/:id/done', async (req) => {
    db.prepare('DELETE FROM list_items WHERE list_id = ? AND done = 1').run(req.params.id);
    return allLists(db);
  });

  app.post<{ Params: { id: string }; Body: { title: string; due?: string | null; memberId?: string | null } }>('/api/lists/:id/items', {
    schema: { body: { type: 'object', required: ['title'], additionalProperties: false, properties: { title: TITLE, due: DUE, memberId: MEMBER } } },
  }, async (req, reply) => {
    const { due = null, memberId = null } = req.body;
    const title = tidy(req.body.title);
    if (!title) return reply.code(400).send({ error: 'A name is needed' });
    if (!db.prepare('SELECT 1 FROM lists WHERE id = ?').get(req.params.id)) return reply.code(404).send({ error: 'List not found' });
    if (due && !validDue(due)) return reply.code(400).send({ error: 'When should be a day or a time' });
    if (!memberOk(memberId)) return reply.code(400).send({ error: 'Unknown member' });
    db.prepare('INSERT INTO list_items (id, list_id, title, due, member_id) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), req.params.id, title, due, memberId);
    reply.code(201);
    return allLists(db);
  });

  // Tick or untick (anyone); rename, when and who (a parent).
  app.patch<{ Params: { id: string }; Body: { done?: boolean; title?: string; due?: string | null; memberId?: string | null } }>('/api/lists/items/:id', {
    schema: { body: { type: 'object', minProperties: 1, additionalProperties: false,
      properties: { done: { type: 'boolean' }, title: TITLE, due: DUE, memberId: MEMBER } } },
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM list_items WHERE id = ?').get(req.params.id) as ItemRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Item not found' });
    const b = req.body;
    if (b.title !== undefined && !tidy(b.title)) return reply.code(400).send({ error: 'A name is needed' });
    if (b.due && !validDue(b.due)) return reply.code(400).send({ error: 'When should be a day or a time' });
    if (!memberOk(b.memberId)) return reply.code(400).send({ error: 'Unknown member' });
    const done = b.done ?? row.done === 1;
    // Unticked: its alert can come again.
    if (!done && row.done === 1) forgetAlerts(db, row.id);
    db.prepare(`UPDATE list_items SET title = ?, done = ?, due = ?, member_id = ?,
      done_at = CASE WHEN ? THEN COALESCE(done_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) END WHERE id = ?`)
      .run(b.title !== undefined ? tidy(b.title) : row.title, done ? 1 : 0, b.due !== undefined ? b.due : row.due,
        b.memberId !== undefined ? b.memberId : row.member_id, done ? 1 : 0, row.id);
    return allLists(db);
  });

  app.delete<{ Params: { id: string } }>('/api/lists/items/:id', async (req, reply) => {
    if (!db.prepare('DELETE FROM list_items WHERE id = ?').run(req.params.id).changes) return reply.code(404).send({ error: 'Item not found' });
    forgetAlerts(db, req.params.id);
    return allLists(db);
  });
}
