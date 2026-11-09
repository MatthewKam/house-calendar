import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';

// Special days a grown-up adds for kid mode's month card ("Cousins visit", "School play"), alongside the
// holidays and birthdays the app works out itself: for one kid or all of them, once or every year.

export interface SpecialDay {
  id: string;
  /** YYYY-MM-DD (every year: the year it was added for). */
  day: string;
  name: string;
  picture: string;
  /** Just this kid's; null: everyone's. */
  memberId: string | null;
  yearly: boolean;
}

interface Row { id: string; day: string; name: string; picture: string; member_id: string | null; yearly: number }

const toDay = (r: Row): SpecialDay => ({ id: r.id, day: r.day, name: r.name, picture: r.picture, memberId: r.member_id, yearly: !!r.yearly });

export function registerSpecialDays(app: FastifyInstance, db: DB) {
  const all = () => (db.prepare('SELECT * FROM special_days ORDER BY day, name').all() as Row[]).map(toDay);

  app.get('/api/special-days', async () => all());

  // A grown-up adds one: answers with them all.
  app.post<{ Body: { day: string; name: string; picture: string; memberId?: string | null; yearly?: boolean } }>('/api/special-days', {
    schema: { body: { type: 'object', required: ['day', 'name', 'picture'], additionalProperties: false, properties: {
      day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, name: { type: 'string', minLength: 1, maxLength: 60 },
      picture: { type: 'string', minLength: 1, maxLength: 16 }, memberId: { type: ['string', 'null'] }, yearly: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const { day, name, picture, memberId = null, yearly = false } = req.body;
    if (memberId && !db.prepare('SELECT 1 FROM members WHERE id = ?').get(memberId)) return reply.code(404).send({ error: 'Unknown member' });
    db.prepare('INSERT INTO special_days (id, day, name, picture, member_id, yearly) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), day, name.trim(), picture, memberId, yearly ? 1 : 0);
    reply.code(201);
    return all();
  });

  app.delete<{ Params: { id: string } }>('/api/special-days/:id', async (req, reply) => {
    if (db.prepare('DELETE FROM special_days WHERE id = ?').run(req.params.id).changes === 0) return reply.code(404).send({ error: 'Not found' });
    return all();
  });
}
