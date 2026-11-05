import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { bucket } from './rewards.ts';
import { ACTIVITIES } from './activities.ts';
import { GOAL_LIBRARY, type GoalTemplate } from './goalLibrary.ts';

// Goals: a skill a kid works on over time (from the starter library, or the parent's own), with no
// deadline, and a parent confirms when they've got it. The parent picks what it's worth when adding
// it (GOAL_STARS unless they change it; more than a moment, since a goal takes weeks), earned when done.

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
export const GOAL_STARS = 5;
/** Working on a few at a time keeps it focused. */
export const MAX_WORKING = 3;

interface GoalRow {
  id: string; member_id: string; library_key: string | null; title: string; emoji: string; kind: string;
  started_day: string; done_day: string | null; note: string | null; points: number; stars: number; created_at: string;
}
const toGoal = (r: GoalRow) => ({
  id: r.id, memberId: r.member_id, libraryKey: r.library_key, title: r.title, emoji: r.emoji, kind: r.kind,
  startedDay: r.started_day, doneDay: r.done_day, note: r.note, points: r.points, stars: r.stars,
});

export function registerGoals(app: FastifyInstance, db: DB) {
  const get = (id: string) => db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined;
  /** The starter goals, then the family's own (oldest first). */
  /** A parent's own goal into the library; the same name again is the same goal (shown again if it was hidden). */
  function addOwn(title: string, emoji: string, kind: string) {
    title = title.trim();
    let goal = library().find((g) => g.own && g.title.toLowerCase() === title.toLowerCase());
    if (!goal) {
      const key = `own:${randomUUID()}`;
      db.prepare('INSERT INTO own_goals (key, title, emoji, kind) VALUES (?, ?, ?, ?)').run(key, title, emoji, kind);
      goal = library().find((g) => g.key === key)!;
    }
    db.prepare('DELETE FROM hidden_goals WHERE library_key = ?').run(goal.key);
    return goal;
  }
  const library = (): (GoalTemplate & { own: boolean })[] => [
    ...GOAL_LIBRARY.map((g) => ({ ...g, own: false })),
    ...(db.prepare('SELECT key, title, emoji, kind FROM own_goals ORDER BY created_at').all() as Omit<GoalTemplate, 'stages'>[])
      .map((g) => ({ ...g, stages: [], own: true })),
  ];

  // The starter goals, each marked hidden if the family has hidden it.
  app.get('/api/goals/library', async () => {
    const hidden = new Set((db.prepare('SELECT library_key FROM hidden_goals').all() as { library_key: string }[]).map((r) => r.library_key));
    return library().map((g) => ({ ...g, hidden: hidden.has(g.key) }));
  });

  // A parent's own goal into the library without starting it (a kid already working on three, say).
  app.post<{ Body: { title: string; emoji: string; kind: string } }>('/api/goals/library', {
    schema: { body: { type: 'object', required: ['title', 'emoji', 'kind'], additionalProperties: false,
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 80 }, emoji: { type: 'string', minLength: 1, maxLength: 16 }, kind: { enum: ACTIVITIES },
      } } },
  }, async (req, reply) => {
    if (!req.body.title.trim()) return reply.code(400).send({ error: 'A goal needs a name' });
    reply.code(201);
    return { ...addOwn(req.body.title, req.body.emoji, req.body.kind), hidden: false };
  });

  // Hide every goal in the library, or show them all again.
  app.put<{ Body: { hidden: boolean } }>('/api/goals/library', {
    schema: { body: { type: 'object', required: ['hidden'], additionalProperties: false, properties: { hidden: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const keys = library().map((g) => g.key);
    db.transaction(() => {
      db.prepare('DELETE FROM hidden_goals').run();
      if (req.body.hidden) for (const k of keys) db.prepare('INSERT INTO hidden_goals (library_key) VALUES (?)').run(k);
    })();
    return reply.code(204).send();
  });

  // Hide a starter goal the family won't use, or show it again.
  app.put<{ Params: { key: string }; Body: { hidden: boolean } }>('/api/goals/library/:key', {
    schema: { body: { type: 'object', required: ['hidden'], additionalProperties: false, properties: { hidden: { type: 'boolean' } } } },
  }, async (req, reply) => {
    if (!library().some((g) => g.key === req.params.key)) return reply.code(404).send({ error: 'Unknown goal' });
    if (req.body.hidden) db.prepare('INSERT INTO hidden_goals (library_key) VALUES (?) ON CONFLICT DO NOTHING').run(req.params.key);
    else db.prepare('DELETE FROM hidden_goals WHERE library_key = ?').run(req.params.key);
    return reply.code(204).send();
  });

  // Every kid's goals: being worked on first (oldest first), then done (newest first).
  app.get('/api/goals', async () =>
    (db.prepare('SELECT * FROM goals ORDER BY done_day IS NOT NULL, COALESCE(done_day, \'\') DESC, created_at').all() as GoalRow[])
      .map(toGoal));

  // Start one: from the library (`libraryKey`), or a new one of the parent's own (`title`, `emoji`,
  // `kind`), which joins the library for every kid.
  app.post<{ Body: { memberId: string; day: string; libraryKey?: string; title?: string; emoji?: string; kind?: string; points?: number } }>('/api/goals', {
    schema: { body: { type: 'object', required: ['memberId', 'day'], additionalProperties: false,
      properties: {
        memberId: { type: 'string' }, day: { type: 'string', pattern: DAY }, libraryKey: { type: 'string' },
        title: { type: 'string', minLength: 1, maxLength: 80 }, emoji: { type: 'string', minLength: 1, maxLength: 16 },
        kind: { enum: ACTIVITIES }, points: { type: 'integer', minimum: 0, maximum: 50 },
      } } },
  }, async (req, reply) => {
    const { memberId, day, libraryKey } = req.body;
    if (!db.prepare('SELECT 1 FROM members WHERE id = ?').get(memberId)) return reply.code(400).send({ error: 'Unknown member' });
    const working = (db.prepare('SELECT COUNT(*) n FROM goals WHERE member_id = ? AND done_day IS NULL').get(memberId) as { n: number }).n;
    if (working >= MAX_WORKING) return reply.code(409).send({ error: `Working on ${MAX_WORKING} goals at once is plenty. Finish or remove one first.` });
    let from = libraryKey ? library().find((g) => g.key === libraryKey) : null;
    if (libraryKey && !from) return reply.code(400).send({ error: 'Unknown goal' });
    if (!from) {
      const { title, emoji, kind } = req.body;
      if (!title?.trim() || !emoji || !kind) return reply.code(400).send({ error: 'A goal needs a name, a picture and a group' });
      from = addOwn(title, emoji, kind);
    }
    const goal = from;
    if (db.prepare('SELECT 1 FROM goals WHERE member_id = ? AND library_key = ? AND done_day IS NULL').get(memberId, goal.key)) {
      return reply.code(409).send({ error: 'Already working on that one' });
    }
    const id = randomUUID();
    db.prepare('INSERT INTO goals (id, member_id, library_key, title, emoji, kind, started_day, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, memberId, goal.key, goal.title, goal.emoji, goal.kind, day, req.body.points ?? GOAL_STARS);
    reply.code(201);
    return toGoal(get(id)!);
  });

  // They did it: a parent confirms, with a note if they like.
  app.post<{ Params: { id: string }; Body: { day: string; note?: string } }>('/api/goals/:id/done', {
    schema: { body: { type: 'object', required: ['day'], additionalProperties: false,
      properties: { day: { type: 'string', pattern: DAY }, note: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Not found' });
    if (row.done_day) return toGoal(row);
    db.prepare('UPDATE goals SET done_day = ?, note = ?, stars = points WHERE id = ?').run(req.body.day, req.body.note?.trim() || null, row.id);
    return toGoal(get(row.id)!);
  });

  // Removing one: a goal not worked on any more, or one marked done by mistake (not once its stars are in a jar).
  app.delete<{ Params: { id: string } }>('/api/goals/:id', async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Not found' });
    if (row.stars > bucket(db, row.member_id)) return reply.code(409).send({ error: 'Those stars are already in a jar' });
    db.prepare('DELETE FROM goals WHERE id = ?').run(row.id);
    return reply.code(204).send();
  });
}
