import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';

// Rewards a person earns with stars from extra tasks. Several per person, each counted on its own:
//   monthly        stars earned this month; starts over on the 1st
//   until_reached  stars earned since the reward was set, until the goal; then "mark as given"

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
type Mode = 'monthly' | 'until_reached';
interface RewardRow {
  id: string; member_id: string; title: string; goal: number; mode: Mode;
  start_day: string; created_at: string; claimed_at: string | null;
}
const PROPS = {
  title: { type: 'string', minLength: 1, maxLength: 80 },
  goal: { type: 'integer', minimum: 1, maximum: 100000 },
  mode: { enum: ['monthly', 'until_reached'] },
} as const;

export function registerRewards(app: FastifyInstance, db: DB) {
  const get = (id: string) => db.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as RewardRow | undefined;
  /** Stars a person earned on local days from `from` up to and including `to`. */
  const starsBetween = db.prepare(`SELECT COALESCE(SUM(points), 0) AS n FROM task_done
    WHERE member_id = ? AND day >= ? AND day <= ?`);

  /** With `today`, includes the stars counted toward it so far. */
  function toReward(r: RewardRow, today?: string) {
    const from = r.mode === 'monthly' && today ? `${today.slice(0, 8)}01` : r.start_day;
    const stars = today ? (starsBetween.get(r.member_id, from, today) as { n: number }).n : undefined;
    return {
      id: r.id, memberId: r.member_id, title: r.title, goal: r.goal, mode: r.mode,
      startDay: r.start_day, claimedAt: r.claimed_at, stars,
    };
  }

  // Rewards still on the cards (not yet given), with progress as of the display's `today`.
  app.get<{ Querystring: { today: string } }>('/api/rewards', {
    schema: { querystring: { type: 'object', required: ['today'], properties: { today: { type: 'string', pattern: DAY } } } },
  }, async (req) =>
    (db.prepare('SELECT * FROM rewards WHERE claimed_at IS NULL ORDER BY created_at').all() as RewardRow[])
      .map((r) => toReward(r, req.query.today)));

  app.post<{ Body: { memberId: string; title: string; goal: number; mode: Mode; startDay: string } }>('/api/rewards', {
    schema: { body: { type: 'object', required: ['memberId', 'title', 'goal', 'mode', 'startDay'], additionalProperties: false,
      properties: { ...PROPS, memberId: { type: 'string' }, startDay: { type: 'string', pattern: DAY } } } },
  }, async (req, reply) => {
    if (!db.prepare('SELECT 1 FROM members WHERE id = ?').get(req.body.memberId)) {
      return reply.code(400).send({ error: 'Unknown member' });
    }
    const id = randomUUID();
    db.prepare('INSERT INTO rewards (id, member_id, title, goal, mode, start_day) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.body.memberId, req.body.title.trim(), req.body.goal, req.body.mode, req.body.startDay);
    reply.code(201);
    return toReward(get(id)!, req.body.startDay);
  });

  app.patch<{ Params: { id: string }; Body: { title?: string; goal?: number; mode?: Mode } }>('/api/rewards/:id', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1, properties: PROPS } },
  }, async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Reward not found' });
    db.prepare('UPDATE rewards SET title = ?, goal = ?, mode = ? WHERE id = ?')
      .run((req.body.title ?? row.title).trim(), req.body.goal ?? row.goal, req.body.mode ?? row.mode, row.id);
    return toReward(get(row.id)!);
  });

  // The reward was handed over: it leaves the card.
  app.post<{ Params: { id: string } }>('/api/rewards/:id/given', async (req, reply) => {
    const res = db.prepare(`UPDATE rewards SET claimed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND claimed_at IS NULL`)
      .run(req.params.id);
    if (res.changes === 0) return reply.code(404).send({ error: 'Reward not found' });
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/rewards/:id', async (req, reply) => {
    const res = db.prepare('DELETE FROM rewards WHERE id = ?').run(req.params.id);
    if (res.changes === 0) return reply.code(404).send({ error: 'Reward not found' });
    return reply.code(204).send();
  });
}
