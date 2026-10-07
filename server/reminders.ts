import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { DB } from './db.ts';

// iCloud Reminders on the wall, synced by an iPhone Shortcut on each phone (see README).
//
// A Shortcut run: GET /api/reminders/phone/pending → apply those in Reminders → POST
// /api/reminders/phone/sync with a snapshot of the phone's reminders and the ids it applied.
// The wall shows the latest snapshot of each list, with its own not-yet-applied changes on top.

/** A claimed change that isn't confirmed within this long goes back to the queue. */
const CLAIM_MS = 15 * 60_000;

interface ItemRow { id: number; list: string; title: string; done: number; due: string | null }
interface OutboxRow {
  id: number; op: 'add' | 'complete' | 'uncomplete' | 'rename'; list: string; title: string; new_title: string | null; claimed_by: string | null;
}

export interface PhoneItem { list: string; title: string; done?: boolean | string; due?: string | null }

/** Lists and titles are matched loosely: Shortcuts may add stray spaces. */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
const same = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();
/** Shortcuts sends booleans as true/false, "Yes"/"No" or 1/0 depending on how the dictionary is built. */
const truthy = (v: unknown) => v === true || v === 1 || /^(true|yes|1)$/i.test(String(v ?? ''));

/**
 * Reads a list the Shortcut sent as text. A JSON body field typed Text turns a list of dictionaries into
 * the dictionaries one after another, one per line, rather than a JSON array; both forms are accepted,
 * as is a single dictionary. Returns null when it can't be read.
 */
export function readList(text: string): unknown[] | null {
  const t = text.trim();
  if (!t) return [];
  for (const candidate of [t, `[${t.replace(/}\s*\n\s*{/g, '},{')}]`]) {
    try {
      const v = JSON.parse(candidate);
      return Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : null;
    } catch {
      // Try the next form.
    }
  }
  return null;
}

function tokenOk(req: FastifyRequest, token: string) {
  const got = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Replaces the reminders of every list in this phone's snapshot, and confirms the changes it applied.
 * `listNames` adds lists with nothing in them, which a snapshot of reminders alone can't show.
 */
export function applySnapshot(db: DB, device: string, items: PhoneItem[], applied: number[], now = new Date(), listNames: string[] = []) {
  const lists = new Map<string, PhoneItem[]>();
  for (const name of listNames) {
    if (typeof name === 'string' && name.trim() && ![...lists.keys()].some((k) => same(k, name))) lists.set(norm(name), []);
  }
  for (const it of items) {
    if (typeof it?.list !== 'string' || typeof it.title !== 'string' || !it.list.trim() || !it.title.trim()) continue;
    const key = norm(it.list);
    const existing = [...lists.keys()].find((k) => same(k, key)) ?? key;
    lists.set(existing, [...(lists.get(existing) ?? []), it]);
  }
  db.transaction(() => {
    if (applied.length) {
      db.prepare(`DELETE FROM reminder_outbox WHERE claimed_by = ? AND id IN (SELECT value FROM json_each(?))`)
        .run(device, JSON.stringify(applied));
    }
    const clear = db.prepare('DELETE FROM reminder_items WHERE list = ? COLLATE NOCASE');
    const add = db.prepare('INSERT INTO reminder_items (list, title, done, due) VALUES (?, ?, ?, ?)');
    const seen = db.prepare(`INSERT INTO reminder_devices (device, list, synced_at) VALUES (?, ?, ?)
      ON CONFLICT (device, list) DO UPDATE SET synced_at = excluded.synced_at`);
    for (const [list, its] of lists) {
      clear.run(list);
      for (const it of its) add.run(list, norm(it.title), truthy(it.done) ? 1 : 0, it.due || null);
      seen.run(device, list, now.toISOString());
    }
    // Lists this phone used to have but didn't send are gone from it (deleted or unshared).
    db.prepare(`DELETE FROM reminder_devices WHERE device = ? AND list NOT IN (SELECT value FROM json_each(?))`)
      .run(device, JSON.stringify([...lists.keys()]));
    // A list no phone reports any more disappears from the wall.
    db.prepare(`DELETE FROM reminder_items WHERE list COLLATE NOCASE NOT IN (SELECT list FROM reminder_devices)`).run();
    // Drop wall changes the phones already reflect (e.g. applied, but the confirmation was lost), so a
    // retried run doesn't add the same item twice.
    db.prepare(`DELETE FROM reminder_outbox WHERE EXISTS (
      SELECT 1 FROM reminder_items i WHERE i.list = reminder_outbox.list COLLATE NOCASE
        AND i.title = reminder_outbox.title COLLATE NOCASE
        AND (reminder_outbox.op = 'add'
          OR (reminder_outbox.op = 'complete' AND i.done = 1)
          OR (reminder_outbox.op = 'uncomplete' AND i.done = 0)))`).run();
    // A rename is done once an item has the new name.
    db.prepare(`DELETE FROM reminder_outbox WHERE op = 'rename' AND EXISTS (
      SELECT 1 FROM reminder_items i WHERE i.list = reminder_outbox.list COLLATE NOCASE
        AND i.title = reminder_outbox.new_title COLLATE NOCASE)`).run();
  })();
}

/** Hands this phone the wall's changes for lists it has, claiming them so another phone won't repeat them. */
export function claimPending(db: DB, device: string, now = new Date()) {
  const stale = new Date(now.getTime() - CLAIM_MS).toISOString();
  return db.transaction(() => {
    const rows = db.prepare(`
      SELECT o.* FROM reminder_outbox o
      WHERE (o.claimed_by IS NULL OR o.claimed_by = @device OR o.claimed_at < @stale)
        AND EXISTS (SELECT 1 FROM reminder_devices d WHERE d.device = @device AND d.list = o.list COLLATE NOCASE)
      ORDER BY o.op = 'rename', o.id`).all({ device, stale }) as OutboxRow[];
    const claim = db.prepare('UPDATE reminder_outbox SET claimed_by = ?, claimed_at = ? WHERE id = ?');
    for (const r of rows) claim.run(device, now.toISOString(), r.id);
    // Renames come last, so ticks queued under the old name still find their item.
    return rows.map((r) => ({ id: r.id, op: r.op, list: r.list, title: r.title, ...(r.op === 'rename' ? { newTitle: r.new_title } : {}) }));
  })();
}

/** What the wall shows: each list's latest snapshot with the wall's own pending changes applied. */
export function wallLists(db: DB) {
  const items = db.prepare('SELECT * FROM reminder_items ORDER BY done, id').all() as ItemRow[];
  // Renames last, as they'll be applied.
  const outbox = db.prepare(`SELECT * FROM reminder_outbox ORDER BY op = 'rename', id`).all() as OutboxRow[];
  const devices = db.prepare('SELECT device, list, synced_at FROM reminder_devices').all() as
    { device: string; list: string; synced_at: string }[];

  const lists = new Map<string, { title: string; items: { id: string; title: string; done: boolean; due: string | null; pending: boolean }[] }>();
  const listFor = (name: string) => {
    const key = [...lists.keys()].find((k) => same(k, name));
    if (key) return lists.get(key)!;
    const fresh = { title: norm(name), items: [] };
    lists.set(norm(name), fresh);
    return fresh;
  };
  for (const d of devices) listFor(d.list);
  for (const it of items) {
    listFor(it.list).items.push({ id: `p${it.id}`, title: it.title, done: it.done === 1, due: it.due, pending: false });
  }
  for (const o of outbox) {
    const list = listFor(o.list);
    if (o.op === 'add') {
      list.items.push({ id: `w${o.id}`, title: o.title, done: false, due: null, pending: true });
    } else if (o.op === 'rename') {
      const item = list.items.find((i) => same(i.title, o.title));
      if (item) Object.assign(item, { title: o.new_title, pending: true });
    } else {
      const item = list.items.find((i) => same(i.title, o.title) && i.done === (o.op === 'uncomplete'));
      if (item) Object.assign(item, { done: o.op === 'complete', pending: true });
    }
  }
  const lastSync = (list: string) => devices.filter((d) => same(d.list, list))
    .map((d) => ({ device: d.device, at: d.synced_at }))
    .sort((a, b) => b.at.localeCompare(a.at));
  return [...lists.values()]
    .map((l) => ({ ...l, items: [...l.items.filter((i) => !i.done), ...l.items.filter((i) => i.done)], syncedBy: lastSync(l.title) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function registerReminders(app: FastifyInstance, db: DB, token: string | undefined, onWallChange?: () => void) {
  // ---- Wall -----------------------------------------------------------------
  app.get('/api/reminders', async () => ({ enabled: !!token, lists: wallLists(db) }));

  app.post<{ Body: { list: string; title: string } }>('/api/reminders', {
    schema: { body: { type: 'object', required: ['list', 'title'], additionalProperties: false,
      properties: { list: { type: 'string', minLength: 1, maxLength: 200 }, title: { type: 'string', minLength: 1, maxLength: 300 } } } },
  }, async (req, reply) => {
    const known = (db.prepare('SELECT list FROM reminder_devices').all() as { list: string }[]).find((d) => same(d.list, req.body.list));
    if (!known) return reply.code(400).send({ error: 'Unknown list' });
    db.prepare(`INSERT INTO reminder_outbox (op, list, title) VALUES ('add', ?, ?)`).run(known.list, norm(req.body.title));
    onWallChange?.();
    reply.code(201);
    return { lists: wallLists(db) };
  });

  // Tick, untick or rename, by the id the wall was given (p = from a phone, w = added on the wall).
  app.patch<{ Params: { id: string }; Body: { done?: boolean; title?: string } }>('/api/reminders/:id', {
    schema: { body: { type: 'object', minProperties: 1, maxProperties: 1, additionalProperties: false,
      properties: { done: { type: 'boolean' }, title: { type: 'string', minLength: 1, maxLength: 300 } } } },
  }, async (req, reply) => {
    const { id } = req.params;
    if (req.body.title !== undefined) {
      const title = norm(req.body.title);
      if (!title) return reply.code(400).send({ error: 'A name is needed' });
      if (id.startsWith('w')) {
        // Not on any phone yet: it's added with the new name.
        const changed = db.prepare(`UPDATE reminder_outbox SET title = ? WHERE id = ? AND op = 'add'`).run(title, Number(id.slice(1)));
        if (!changed.changes) return reply.code(404).send({ error: 'Reminder not found' });
      } else {
        const item = db.prepare('SELECT * FROM reminder_items WHERE id = ?').get(Number(id.slice(1))) as ItemRow | undefined;
        if (!item) return reply.code(404).send({ error: 'Reminder not found' });
        db.transaction(() => {
          // One waiting rename per item; renaming back to its name in Reminders cancels it.
          db.prepare(`DELETE FROM reminder_outbox WHERE op = 'rename' AND list = ? COLLATE NOCASE AND title = ? COLLATE NOCASE`)
            .run(item.list, item.title);
          if (title !== item.title) {
            db.prepare(`INSERT INTO reminder_outbox (op, list, title, new_title) VALUES ('rename', ?, ?, ?)`).run(item.list, item.title, title);
          }
        })();
      }
      onWallChange?.();
      return { lists: wallLists(db) };
    }
    const done = req.body.done!;
    if (id.startsWith('w')) {
      // Not on any phone yet: ticking it off just cancels the add.
      const row = db.prepare(`SELECT * FROM reminder_outbox WHERE id = ? AND op = 'add'`).get(Number(id.slice(1))) as OutboxRow | undefined;
      if (!row) return reply.code(404).send({ error: 'Reminder not found' });
      if (done) db.prepare('DELETE FROM reminder_outbox WHERE id = ?').run(row.id);
      return { lists: wallLists(db) };
    }
    const item = db.prepare('SELECT * FROM reminder_items WHERE id = ?').get(Number(id.slice(1))) as ItemRow | undefined;
    if (!item) return reply.code(404).send({ error: 'Reminder not found' });
    db.transaction(() => {
      // Undo a not-yet-applied opposite change instead of queueing a second one.
      const undo = db.prepare(`DELETE FROM reminder_outbox WHERE op = ? AND list = ? COLLATE NOCASE AND title = ? COLLATE NOCASE`)
        .run(done ? 'uncomplete' : 'complete', item.list, item.title);
      if (undo.changes === 0 && (item.done === 1) !== done) {
        db.prepare('INSERT INTO reminder_outbox (op, list, title) VALUES (?, ?, ?)')
          .run(done ? 'complete' : 'uncomplete', item.list, item.title);
      }
    })();
    onWallChange?.();
    return { lists: wallLists(db) };
  });

  // ---- Phones (the Shortcut) ----------------------------------------------------
  const phoneOnly = async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
    if (!token) return reply.code(503).send({ error: 'Set REMINDERS_TOKEN in .env to turn on Reminders sync' });
    if (!tokenOk(req, token)) return reply.code(401).send({ error: 'Wrong or missing token' });
  };
  const DEVICE = { type: 'string', minLength: 1, maxLength: 60 } as const;

  app.get<{ Querystring: { device: string } }>('/api/reminders/phone/pending', {
    preHandler: phoneOnly,
    schema: { querystring: { type: 'object', required: ['device'], properties: { device: DEVICE } } },
  }, async (req) => ({ changes: claimPending(db, norm(req.query.device)) }));

  app.post<{ Body: { device: string; items: PhoneItem[] | string; applied?: (number | string)[] | string; lists?: string[] | string } }>('/api/reminders/phone/sync', {
    preHandler: phoneOnly,
    bodyLimit: 2 * 1024 * 1024,
    schema: { body: { type: 'object', required: ['device', 'items'], properties: { device: DEVICE } } },
  }, async (req, reply) => {
    // Shortcuts can send lists as JSON or as text; accept either.
    const read = (v: unknown) => (typeof v === 'string' ? readList(v) : Array.isArray(v) ? v : v == null ? [] : [v]);
    const items = read(req.body.items);
    const applied = read(req.body.applied);
    if (!items || !applied) {
      const bad = String(items ? req.body.applied : req.body.items).slice(0, 120);
      return reply.code(400).send({ error: `Couldn't read ${items ? 'applied' : 'items'}; it starts: ${bad}` });
    }
    // Optional list names (so empty lists show): a JSON list, or one name per line.
    const names = typeof req.body.lists === 'string' ? (readList(req.body.lists) ?? req.body.lists.split('\n')) : req.body.lists ?? [];
    applySnapshot(db, norm(req.body.device), items as PhoneItem[], applied.map(Number).filter(Number.isFinite), new Date(),
      (names as unknown[]).filter((n): n is string => typeof n === 'string'));
    return { ok: true, lists: wallLists(db).length };
  });
}
