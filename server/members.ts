import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { applyPeople, forgetMember } from './people.ts';
import { COLOR, DAY_VALUE } from './schemas.ts';
import { localDay, stageOf, STAGES } from './stages.ts';

// The family: each person's name, colour, place in the order, birthday and stage.

interface MemberRow { id: string; name: string; color: string; sort_order: number; birthdate: string | null; stage: string | null }
const toMember = (r: MemberRow) => ({
  id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order, birthdate: r.birthdate,
  // The stage in effect, and the one a guardian chose (null: from the birthdate).
  stage: stageOf(r, localDay()), stageChosen: r.stage,
});
const NAME = { type: 'string', minLength: 1, maxLength: 40 } as const;

/** A real day (not Feb 31). */
const realDay = (d: string) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
};

export function registerMembers(app: FastifyInstance, db: DB, opts: {
  /** The family list changed, so Claude can sort what is now unassigned. */
  onAssignmentsChanged?: () => void;
  /** Someone was removed, so their sign-ins to this household go too. */
  onMemberRemoved?: (memberId: string) => void;
}) {
  const get = (id: string) => db.prepare('SELECT * FROM members WHERE id = ?').get(id) as MemberRow | undefined;

  app.get('/api/members', async () =>
    (db.prepare('SELECT * FROM members ORDER BY sort_order, created_at').all() as MemberRow[]).map(toMember));

  app.post<{ Body: { name: string; color: string } }>('/api/members', {
    schema: { body: { type: 'object', required: ['name', 'color'], additionalProperties: false, properties: { name: NAME, color: COLOR } } },
  }, async (req, reply) => {
    const id = randomUUID();
    const next = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM members').get() as { n: number }).n;
    db.prepare('INSERT INTO members (id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(id, req.body.name.trim(), req.body.color.toLowerCase(), next);
    opts.onAssignmentsChanged?.();
    reply.code(201);
    return toMember(get(id)!);
  });

  app.patch<{ Params: { id: string }; Body: { name?: string; color?: string; sortOrder?: number; birthdate?: string | null; stage?: string | null } }>('/api/members/:id', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1,
      properties: {
        name: NAME, color: COLOR, sortOrder: { type: 'integer' },
        birthdate: { anyOf: [DAY_VALUE, { type: 'null' }] }, stage: { anyOf: [{ enum: STAGES }, { type: 'null' }] },
      } } },
  }, async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Member not found' });
    const { name = row.name, color = row.color, sortOrder = row.sort_order, birthdate = row.birthdate, stage = row.stage } = req.body;
    // A real day, and not in the future.
    if (birthdate && (!realDay(birthdate) || birthdate > localDay())) {
      return reply.code(400).send({ error: 'That birthday is not a real past date' });
    }
    db.prepare('UPDATE members SET name = ?, color = ?, sort_order = ?, birthdate = ?, stage = ? WHERE id = ?')
      .run(name.trim(), color.toLowerCase(), sortOrder, birthdate, stage, row.id);
    if (name.trim() !== row.name) opts.onAssignmentsChanged?.();
    return toMember(get(row.id)!);
  });

  // Events of a removed member stay on the calendar, for whoever else they're for (or everyone).
  app.delete<{ Params: { id: string } }>('/api/members/:id', async (req, reply) => {
    const res = db.transaction(() => {
      forgetMember(db, req.params.id);
      return db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
    })();
    if (res.changes === 0) return reply.code(404).send({ error: 'Member not found' });
    opts.onMemberRemoved?.(req.params.id);
    // Calendars linked to this person fall back to manual and Claude picks.
    applyPeople(db);
    opts.onAssignmentsChanged?.();
    return reply.code(204).send();
  });
}
