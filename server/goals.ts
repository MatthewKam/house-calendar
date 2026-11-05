import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { ACTIVITIES } from './activities.ts';
import { GOAL_LIBRARY, type GoalTemplate } from './goalLibrary.ts';

// The goal list: starter goals (goalLibrary.ts) and the family's own, to pick from when adding a
// goal to a kid's list (goals themselves are tasks: category 'bonus', ticked any day for points).
// Goals the family won't use can be hidden.

export function registerGoals(app: FastifyInstance, db: DB) {
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
  /** The starter goals, then the family's own (oldest first). */
  const library = (): (GoalTemplate & { own: boolean })[] => [
    ...GOAL_LIBRARY.map((g) => ({ ...g, own: false })),
    ...(db.prepare('SELECT key, title, emoji, kind FROM own_goals ORDER BY created_at').all() as Omit<GoalTemplate, 'stages'>[])
      .map((g) => ({ ...g, stages: [], own: true })),
  ];

  // Every goal in the list, each marked hidden if the family has hidden it.
  app.get('/api/goals/library', async () => {
    const hidden = new Set((db.prepare('SELECT library_key FROM hidden_goals').all() as { library_key: string }[]).map((r) => r.library_key));
    return library().map((g) => ({ ...g, hidden: hidden.has(g.key) }));
  });

  // A parent's own goal into the list, when they write one for a kid (or just to have it there).
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

  // Hide a goal the family won't use, or show it again.
  app.put<{ Params: { key: string }; Body: { hidden: boolean } }>('/api/goals/library/:key', {
    schema: { body: { type: 'object', required: ['hidden'], additionalProperties: false, properties: { hidden: { type: 'boolean' } } } },
  }, async (req, reply) => {
    if (!library().some((g) => g.key === req.params.key)) return reply.code(404).send({ error: 'Unknown goal' });
    if (req.body.hidden) db.prepare('INSERT INTO hidden_goals (library_key) VALUES (?) ON CONFLICT DO NOTHING').run(req.params.key);
    else db.prepare('DELETE FROM hidden_goals WHERE library_key = ?').run(req.params.key);
    return reply.code(204).send();
  });
}
