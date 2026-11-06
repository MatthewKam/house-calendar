import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { ageOn, stageOf, type Stage } from './stages.ts';

// Learning (docs/kids-growth.md): one short activity a day in kid mode, picture-first, no fail states.
// A guardian turns it on for each kid. Everyone starts on level 1; from age 3 a guardian can let a kid
// level up, and from then on each skill moves up by itself once they've got it right a few days running.
// Finishing the day's activity earns at most 1 star (from Early on; the littlest just play).

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';

/** The skills, and the highest level each has. */
export const SKILLS = { animals: 1, story: 1, counting: 2, letters: 2, feelings: 1, patterns: 2 } as const;
export type Skill = keyof typeof SKILLS;

/** What each stage does, taking turns a day at a time. Older stages use Early's for now. */
const SKILLS_FOR: Record<'little' | 'early', Skill[]> = {
  little: ['animals', 'story'],
  early: ['counting', 'letters', 'feelings', 'patterns'],
};

/** Days of getting every round right the first time, at a level, before moving up. */
export const DAYS_TO_LEVEL_UP = 3;
/** Leveling up can be allowed from this age. */
const LEVEL_UP_AGE = 3;

interface KidRow { id: string; birthdate: string | null; stage: string | null; enabled: number | null; level_up: number | null }

const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/** The skill for a kid's stage on a day. */
export function skillFor(stage: Stage | null, day: string): Skill {
  const list = SKILLS_FOR[stage === 'little' || stage === null ? 'little' : 'early'];
  return list[((dayNumber(day) % list.length) + list.length) % list.length];
}

export function registerLearn(app: FastifyInstance, db: DB) {
  const kid = (id: string) => db.prepare(`SELECT m.id, m.birthdate, m.stage, k.enabled, k.level_up
    FROM members m LEFT JOIN learn_kids k ON k.member_id = m.id WHERE m.id = ?`).get(id) as KidRow | undefined;
  /** From age 3 (or, without a birthday, a stage past Little). */
  const canLevelUp = (r: KidRow, today: string) =>
    r.birthdate ? ageOn(r.birthdate, today) >= LEVEL_UP_AGE : r.stage !== null && r.stage !== 'little';
  const levels = (memberId: string) => Object.fromEntries((db.prepare('SELECT skill, level FROM learn_levels WHERE member_id = ?')
    .all(memberId) as { skill: Skill; level: number }[]).map((r) => [r.skill, r.level])) as Partial<Record<Skill, number>>;
  /** The level a kid plays a skill at: 1 unless leveling up is on. */
  const levelOf = (r: KidRow, skill: Skill, today: string) =>
    r.level_up && canLevelUp(r, today) ? Math.min(levels(r.id)[skill] ?? 1, SKILLS[skill]) : 1;

  function state(r: KidRow, today: string) {
    const stage = stageOf(r, today);
    const skill = skillFor(stage, today);
    const done = db.prepare('SELECT stars FROM learn_sessions WHERE member_id = ? AND day = ?').all(r.id, today) as { stars: number }[];
    return {
      memberId: r.id,
      enabled: r.enabled === 1,
      levelUp: r.level_up === 1,
      canLevelUp: canLevelUp(r, today),
      // Each skill of their stage, at the level they'd play it.
      levels: Object.fromEntries(SKILLS_FOR[stage === 'little' || stage === null ? 'little' : 'early']
        .map((s) => [s, levelOf(r, s, today)])),
      today: { skill, level: levelOf(r, skill, today) },
      doneToday: done.length > 0,
      starToday: done.some((d) => d.stars > 0),
    };
  }

  // Each kid's learning: on or off, leveling up, levels, and today's activity.
  app.get<{ Querystring: { today: string } }>('/api/learn', {
    schema: { querystring: { type: 'object', required: ['today'], properties: { today: { type: 'string', pattern: DAY } } } },
  }, async (req) => {
    const rows = db.prepare(`SELECT m.id, m.birthdate, m.stage, k.enabled, k.level_up
      FROM members m LEFT JOIN learn_kids k ON k.member_id = m.id ORDER BY m.sort_order, m.created_at`).all() as KidRow[];
    return rows.filter((r) => { const s = stageOf(r, req.query.today); return s !== null && s !== 'adult'; })
      .map((r) => state(r, req.query.today));
  });

  // A guardian turns learning on or off for a kid, and lets them level up (from age 3).
  app.put<{ Params: { memberId: string }; Body: { enabled?: boolean; levelUp?: boolean; today: string } }>('/api/learn/:memberId', {
    schema: { body: { type: 'object', required: ['today'], additionalProperties: false, minProperties: 2, properties: {
      enabled: { type: 'boolean' }, levelUp: { type: 'boolean' }, today: { type: 'string', pattern: DAY } } } },
  }, async (req, reply) => {
    const r = kid(req.params.memberId);
    if (!r) return reply.code(404).send({ error: 'Member not found' });
    const stage = stageOf(r, req.body.today);
    if (stage === null || stage === 'adult') return reply.code(400).send({ error: 'Learning is for the kids' });
    if (req.body.levelUp && !canLevelUp(r, req.body.today)) return reply.code(400).send({ error: 'Leveling up starts at age 3' });
    db.prepare(`INSERT INTO learn_kids (member_id, enabled, level_up) VALUES (?, ?, ?)
      ON CONFLICT (member_id) DO UPDATE SET enabled = excluded.enabled, level_up = excluded.level_up`)
      .run(r.id, (req.body.enabled ?? r.enabled === 1) ? 1 : 0, (req.body.levelUp ?? r.level_up === 1) ? 1 : 0);
    return state(kid(r.id)!, req.body.today);
  });

  // A finished activity: rounds played and how many were right the first time. The day's first earns
  // the star (not for Little); with leveling up on, a few perfect days running moves the skill up.
  app.post<{ Params: { memberId: string }; Body: { today: string; skill: Skill; level: number; rounds: number; firstTry: number } }>(
    '/api/learn/:memberId/done', {
      schema: { body: { type: 'object', required: ['today', 'skill', 'level', 'rounds', 'firstTry'], additionalProperties: false, properties: {
        today: { type: 'string', pattern: DAY }, skill: { enum: Object.keys(SKILLS) },
        level: { type: 'integer', minimum: 1, maximum: 9 }, rounds: { type: 'integer', minimum: 1, maximum: 20 },
        firstTry: { type: 'integer', minimum: 0, maximum: 20 } } } },
    }, async (req, reply) => {
      const r = kid(req.params.memberId);
      if (!r) return reply.code(404).send({ error: 'Member not found' });
      const viewer = req.raw.viewer;
      // A kid's own device plays as that kid.
      if (viewer?.role === 'kid' && viewer.memberId !== r.id) return reply.code(403).send({ error: 'Not your activity' });
      if (!r.enabled) return reply.code(409).send({ error: 'Learning is off for this kid' });
      const { today, skill, level, rounds } = req.body;
      const firstTry = Math.min(req.body.firstTry, rounds);
      const stage = stageOf(r, today);
      const result = db.transaction(() => {
        const already = db.prepare('SELECT 1 FROM learn_sessions WHERE member_id = ? AND day = ? AND stars > 0').get(r.id, today);
        const star = stage !== 'little' && !already ? 1 : 0;
        db.prepare(`INSERT INTO learn_sessions (id, member_id, day, skill, level, rounds, first_try, stars) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), r.id, today, skill, level, rounds, firstTry, star);
        // Moving up: leveling up on, this level's the one they're on, and DAYS_TO_LEVEL_UP different days
        // of perfect play at it.
        let leveledUp = false;
        const at = levelOf(r, skill, today);
        if (r.level_up && canLevelUp(r, today) && level === at && at < SKILLS[skill]) {
          const perfectDays = (db.prepare(`SELECT COUNT(DISTINCT day) n FROM learn_sessions
            WHERE member_id = ? AND skill = ? AND level = ? AND first_try = rounds`).get(r.id, skill, at) as { n: number }).n;
          if (perfectDays >= DAYS_TO_LEVEL_UP) {
            db.prepare(`INSERT INTO learn_levels (member_id, skill, level) VALUES (?, ?, ?)
              ON CONFLICT (member_id, skill) DO UPDATE SET level = excluded.level`).run(r.id, skill, at + 1);
            leveledUp = true;
          }
        }
        return { star: star > 0, leveledUp };
      })();
      return { ...result, ...state(kid(r.id)!, today) };
    });
}
