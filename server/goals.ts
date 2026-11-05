import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { bucket } from './rewards.ts';
import { stageOf } from './stages.ts';
import { GOAL_LIBRARY } from './goalLibrary.ts';

// Goals: a skill a kid works on over time (from the starter library, or the parent's own), with no
// deadline, and a parent confirms when they've got it. Little kids then get a sticker and a cheer;
// everyone older gets GOAL_STARS as well, since a goal takes weeks where a moment is one act.

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
const KINDS = ['body', 'feelings', 'thinking', 'helping', 'myself'] as const;
export const GOAL_STARS = 5;
/** Working on a few at a time keeps it focused. */
export const MAX_WORKING = 3;

interface GoalRow {
  id: string; member_id: string; library_key: string | null; title: string; emoji: string; kind: string;
  started_day: string; done_day: string | null; note: string | null; stars: number; created_at: string;
}
const toGoal = (r: GoalRow) => ({
  id: r.id, memberId: r.member_id, libraryKey: r.library_key, title: r.title, emoji: r.emoji, kind: r.kind,
  startedDay: r.started_day, doneDay: r.done_day, note: r.note, stars: r.stars,
});

export function registerGoals(app: FastifyInstance, db: DB) {
  const get = (id: string) => db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined;

  app.get('/api/goals/library', async () => GOAL_LIBRARY);

  // Every kid's goals: being worked on first (oldest first), then done (newest first).
  app.get('/api/goals', async () =>
    (db.prepare('SELECT * FROM goals ORDER BY done_day IS NOT NULL, COALESCE(done_day, \'\') DESC, created_at').all() as GoalRow[])
      .map(toGoal));

  // Start one: from the library (`libraryKey`), or the parent's own (`title`, `emoji`, `kind`).
  app.post<{ Body: { memberId: string; day: string; libraryKey?: string; title?: string; emoji?: string; kind?: string } }>('/api/goals', {
    schema: { body: { type: 'object', required: ['memberId', 'day'], additionalProperties: false,
      properties: {
        memberId: { type: 'string' }, day: { type: 'string', pattern: DAY }, libraryKey: { type: 'string' },
        title: { type: 'string', minLength: 1, maxLength: 80 }, emoji: { type: 'string', minLength: 1, maxLength: 16 }, kind: { enum: KINDS },
      } } },
  }, async (req, reply) => {
    const { memberId, day, libraryKey } = req.body;
    if (!db.prepare('SELECT 1 FROM members WHERE id = ?').get(memberId)) return reply.code(400).send({ error: 'Unknown member' });
    const from = libraryKey ? GOAL_LIBRARY.find((g) => g.key === libraryKey) : null;
    if (libraryKey && !from) return reply.code(400).send({ error: 'Unknown goal' });
    const goal = from ?? { key: null, title: req.body.title?.trim(), emoji: req.body.emoji, kind: req.body.kind };
    if (!goal.title || !goal.emoji || !goal.kind) return reply.code(400).send({ error: 'A goal needs a name, a picture and a group' });
    const working = (db.prepare('SELECT COUNT(*) n FROM goals WHERE member_id = ? AND done_day IS NULL').get(memberId) as { n: number }).n;
    if (working >= MAX_WORKING) return reply.code(409).send({ error: `Working on ${MAX_WORKING} goals at once is plenty. Finish or remove one first.` });
    if (from && db.prepare('SELECT 1 FROM goals WHERE member_id = ? AND library_key = ? AND done_day IS NULL').get(memberId, from.key)) {
      return reply.code(409).send({ error: 'Already working on that one' });
    }
    const id = randomUUID();
    db.prepare('INSERT INTO goals (id, member_id, library_key, title, emoji, kind, started_day) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, memberId, goal.key, goal.title, goal.emoji, goal.kind, day);
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
    const m = db.prepare('SELECT birthdate, stage FROM members WHERE id = ?').get(row.member_id) as { birthdate: string | null; stage: string | null };
    // Kept with the goal, so a later stage change doesn't change past stars.
    const stars = stageOf(m, req.body.day) === 'little' ? 0 : GOAL_STARS;
    db.prepare('UPDATE goals SET done_day = ?, note = ?, stars = ? WHERE id = ?').run(req.body.day, req.body.note?.trim() || null, stars, row.id);
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
