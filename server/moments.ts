import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { DAY, memberExists } from './schemas.ts';
import { bucket } from './rewards.ts';
import { ACTIVITIES } from './activities.ts';

// Moments: a parent catches a kid doing something good, unplanned, in a couple of taps
// (docs/product-plan.md, "Three ways to earn"): which kid, which of the six activities, and how many
// stars (0 is a sticker and a cheer, with nothing to save up).


interface MomentRow { id: string; member_id: string; kind: string; note: string | null; stars: number; day: string; created_at: string }
const toMoment = (r: MomentRow) => ({ id: r.id, memberId: r.member_id, kind: r.kind, note: r.note, stars: r.stars, day: r.day, createdAt: r.created_at });

export function registerMoments(app: FastifyInstance, db: DB) {
  // Moments between two local days, end exclusive, oldest first.
  app.get<{ Querystring: { from: string; to: string } }>('/api/moments', {
    schema: { querystring: { type: 'object', required: ['from', 'to'],
      properties: { from: { type: 'string', pattern: DAY }, to: { type: 'string', pattern: DAY } } } },
  }, async (req) =>
    (db.prepare('SELECT * FROM moments WHERE day >= ? AND day < ? ORDER BY created_at').all(req.query.from, req.query.to) as MomentRow[])
      .map(toMoment));

  app.post<{ Body: { memberId: string; kind: string; note?: string; day: string; stars?: number } }>('/api/moments', {
    schema: { body: { type: 'object', required: ['memberId', 'kind', 'day'], additionalProperties: false,
      properties: {
        memberId: { type: 'string' }, kind: { enum: ACTIVITIES }, note: { type: 'string', maxLength: 300 },
        day: { type: 'string', pattern: DAY }, stars: { type: 'integer', minimum: 0, maximum: 20 },
      } } },
  }, async (req, reply) => {
    if (!memberExists(db, req.body.memberId)) return reply.code(400).send({ error: 'Unknown member' });
    const stars = req.body.stars ?? 1;
    const id = randomUUID();
    db.prepare('INSERT INTO moments (id, member_id, kind, note, stars, day) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.body.memberId, req.body.kind, req.body.note?.trim() || null, stars, req.body.day);
    reply.code(201);
    return toMoment(db.prepare('SELECT * FROM moments WHERE id = ?').get(id) as MomentRow);
  });

  // Taking one back (tapped by mistake). Like unticking a task, not once its star is in a jar.
  app.delete<{ Params: { id: string } }>('/api/moments/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM moments WHERE id = ?').get(req.params.id) as MomentRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Not found' });
    if (row.stars > bucket(db, row.member_id)) return reply.code(409).send({ error: 'That star is already in a jar' });
    db.prepare('DELETE FROM moments WHERE id = ?').run(row.id);
    return reply.code(204).send();
  });
}
