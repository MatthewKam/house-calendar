import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { applyPeople, forgetMember } from './people.ts';
import { COLOR, DAY_VALUE } from './schemas.ts';
import { localDay, stageOf, STAGES } from './stages.ts';

// The family: each person's name, colour, place in the order, birthday and stage.
//
// A person's color is the household's: changing it waits for the account holder to approve (their own
// changes don't). Grown-ups change their own; a kid's is changed by a parent, or asked for by an older
// kid on their own device. Signed out (a household app on its own), there's no holder: it just changes.

interface MemberRow {
  id: string; name: string; color: string; sort_order: number; birthdate: string | null; stage: string | null;
  asked_color?: string | null; asked_by?: string | null;
}
const toMember = (r: MemberRow, guardians?: string[]) => ({
  id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order, birthdate: r.birthdate,
  // The stage in effect, and the one a guardian chose (null: from the birthdate).
  stage: stageOf(r, localDay()), stageChosen: r.stage,
  // A guardian (known when signed in); a new color waiting for the account holder, and who asked.
  guardian: !!guardians?.includes(r.id),
  colorAsked: r.asked_color ? { color: r.asked_color, by: r.asked_by ?? null } : null,
});
/** Kids this old and up, on their own device, can ask for a new color. */
export const OLDER_KID_AGE = 7;
const ageOn = (birthdate: string, day: string) =>
  Number(day.slice(0, 4)) - Number(birthdate.slice(0, 4)) - (day.slice(5) < birthdate.slice(5) ? 1 : 0);
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
  const SELECT = `SELECT m.*, r.color AS asked_color, a.name AS asked_by FROM members m
    LEFT JOIN color_requests r ON r.member_id = m.id LEFT JOIN members a ON a.id = r.asked_by`;
  const get = (id: string) => db.prepare(`${SELECT} WHERE m.id = ?`).get(id) as MemberRow | undefined;

  app.get('/api/members', async (req) =>
    (db.prepare(`${SELECT} ORDER BY m.sort_order, m.created_at`).all() as MemberRow[]).map((r) => toMember(r, req.raw.viewer?.guardians)));

  app.post<{ Body: { name: string; color: string } }>('/api/members', {
    schema: { body: { type: 'object', required: ['name', 'color'], additionalProperties: false, properties: { name: NAME, color: COLOR } } },
  }, async (req, reply) => {
    const id = randomUUID();
    const next = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM members').get() as { n: number }).n;
    db.prepare('INSERT INTO members (id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(id, req.body.name.trim(), req.body.color.toLowerCase(), next);
    opts.onAssignmentsChanged?.();
    reply.code(201);
    return toMember(get(id)!, req.raw.viewer?.guardians);
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
    // Signed in, a color goes through PUT /api/members/:id/color (and the account holder).
    if (req.body.color !== undefined && req.raw.viewer && req.body.color.toLowerCase() !== row.color) {
      return reply.code(400).send({ error: 'Change a color with its own request' });
    }
    const { name = row.name, color = row.color, sortOrder = row.sort_order, birthdate = row.birthdate, stage = row.stage } = req.body;
    // A real day, and not in the future.
    if (birthdate && (!realDay(birthdate) || birthdate > localDay())) {
      return reply.code(400).send({ error: 'That birthday is not a real past date' });
    }
    db.prepare('UPDATE members SET name = ?, color = ?, sort_order = ?, birthdate = ?, stage = ? WHERE id = ?')
      .run(name.trim(), color.toLowerCase(), sortOrder, birthdate, stage, row.id);
    if (name.trim() !== row.name) opts.onAssignmentsChanged?.();
    return toMember(get(row.id)!, req.raw.viewer?.guardians);
  });

  const setColor = (id: string, color: string) => db.transaction(() => {
    db.prepare('UPDATE members SET color = ? WHERE id = ?').run(color, id);
    db.prepare('DELETE FROM color_requests WHERE member_id = ?').run(id);
  })();

  // A new color for someone: the account holder's (or, signed out, anyone's) is made at once; anyone
  // else's waits for the holder. asked: true when it's waiting.
  app.put<{ Params: { id: string }; Body: { color: string } }>('/api/members/:id/color', {
    schema: { body: { type: 'object', required: ['color'], additionalProperties: false, properties: { color: COLOR } } },
  }, async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Member not found' });
    const color = req.body.color.toLowerCase();
    const v = req.raw.viewer;
    if (v) {
      const own = v.memberId === row.id;
      const kid = !v.guardians.includes(row.id);
      // A parent: their own, or a kid's. A kid on their own device, old enough: their own.
      const may = v.parent ? own || kid
        : v.role === 'kid' && own && !!row.birthdate && ageOn(row.birthdate, localDay()) >= OLDER_KID_AGE;
      if (!may) return reply.code(403).send({ error: kid ? "Ask a grown-up to change this color" : 'Only they can change their color' });
      if (!v.holder) {
        if (color === row.color) db.prepare('DELETE FROM color_requests WHERE member_id = ?').run(row.id);
        else db.prepare(`INSERT INTO color_requests (member_id, color, asked_by) VALUES (?, ?, ?)
          ON CONFLICT(member_id) DO UPDATE SET color = excluded.color, asked_by = excluded.asked_by, asked_at = excluded.asked_at`)
          .run(row.id, color, v.memberId);
        if (v.parent) v.stillParent();
        return { member: toMember(get(row.id)!, v.guardians), asked: color !== row.color };
      }
      v.stillParent();
    }
    setColor(row.id, color);
    return { member: toMember(get(row.id)!, v?.guardians), asked: false };
  });

  // The account holder's answer to a new color asked for.
  app.post<{ Params: { id: string }; Body: { approve: boolean } }>('/api/members/:id/color/answer', {
    schema: { body: { type: 'object', required: ['approve'], additionalProperties: false, properties: { approve: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const v = req.raw.viewer;
    if (v && !v.holder) return reply.code(403).send({ error: 'Only the account holder answers this' });
    const asked = db.prepare('SELECT color FROM color_requests WHERE member_id = ?').get(req.params.id) as { color: string } | undefined;
    if (!asked) return reply.code(404).send({ error: 'Nothing asked' });
    if (req.body.approve) setColor(req.params.id, asked.color);
    else db.prepare('DELETE FROM color_requests WHERE member_id = ?').run(req.params.id);
    v?.stillParent();
    return toMember(get(req.params.id)!, v?.guardians);
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
