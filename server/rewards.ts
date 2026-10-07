import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';

// Rewards kids earn with stars from extra tasks. Each counts on its own:
//   monthly        stars earned this month; starts over on the 1st (each month reached is a win)
//   until_reached  stars earned since it was set, until the goal; then "mark as given". With
//                  repeats, it starts counting again the day after it's given.
// A reward can be for several kids: their stars pooled toward one goal, or each kid reaching it.
// Every time a goal is reached it's recorded in reward_wins: earned, then given.

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
type Mode = 'monthly' | 'until_reached';
type TeamMode = 'pooled' | 'each';
interface RewardRow {
  id: string; member_id: string; title: string; goal: number; mode: Mode; team_mode: TeamMode; repeats: number;
  start_day: string; created_at: string; claimed_at: string | null;
}
interface WinRow {
  id: string; reward_id: string; period: string; title: string; member_ids: string; goal: number; stars: number;
  earned_day: string; given_at: string | null;
}
const PROPS = {
  title: { type: 'string', minLength: 1, maxLength: 80 },
  goal: { type: 'integer', minimum: 1, maximum: 100000 },
  mode: { enum: ['monthly', 'until_reached'] },
  teamMode: { enum: ['pooled', 'each'] },
  repeats: { type: 'boolean' },
  memberIds: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true, items: { type: 'string' } },
} as const;

const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function registerRewards(app: FastifyInstance, db: DB) {
  const get = (id: string) => db.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as RewardRow | undefined;
  const membersOf = (id: string) => (db.prepare(`SELECT rm.member_id FROM reward_members rm JOIN members m ON m.id = rm.member_id
    WHERE rm.reward_id = ? ORDER BY m.sort_order, m.created_at`).all(id) as { member_id: string }[]).map((r) => r.member_id);
  /** Each day's stars for a kid, from `from` up to and including `to`. */
  const starsByDay = db.prepare(`SELECT day, SUM(points) AS n FROM task_done
    WHERE member_id = ? AND day >= ? AND day <= ? GROUP BY day ORDER BY day`);
  const winFor = db.prepare('SELECT * FROM reward_wins WHERE reward_id = ? AND period = ?');

  /** The stretch a reward is counting now. */
  const periodOf = (r: RewardRow, today: string) =>
    r.mode === 'monthly' ? { period: today.slice(0, 7), from: `${today.slice(0, 8)}01` } : { period: r.start_day, from: r.start_day };

  /**
   * Stars toward a reward as of `today`, and the first day its goal was met (null if not yet).
   * Pooled: everyone's stars together. Each: every kid on their own.
   */
  function progress(r: RewardRow, memberIds: string[], from: string, today: string) {
    const daily = memberIds.map((m) => starsByDay.all(m, from, today) as { day: string; n: number }[]);
    const totals = Object.fromEntries(memberIds.map((m, i) => [m, daily[i].reduce((a, d) => a + d.n, 0)]));
    const days = [...new Set(daily.flat().map((d) => d.day))].sort();
    const running = Object.fromEntries(memberIds.map((m) => [m, 0]));
    let reachedOn: string | null = null;
    for (const day of days) {
      memberIds.forEach((m, i) => (running[m] += daily[i].find((d) => d.day === day)?.n ?? 0));
      const met = r.team_mode === 'each' && memberIds.length > 1
        ? memberIds.every((m) => running[m] >= r.goal)
        : Object.values(running).reduce((a, n) => a + n, 0) >= r.goal;
      if (met) {
        reachedOn = day;
        break;
      }
    }
    return { memberStars: totals, stars: Object.values(totals).reduce((a, n) => a + n, 0), reachedOn };
  }

  /**
   * A reward as the wall shows it, keeping its win up to date: recorded the day the goal is first
   * met, and taken back if ticks are undone before it's given.
   */
  function toReward(r: RewardRow, today?: string) {
    const memberIds = membersOf(r.id);
    const base = {
      id: r.id, memberIds, title: r.title, goal: r.goal, mode: r.mode, teamMode: r.team_mode, repeats: r.repeats === 1,
      startDay: r.start_day, claimedAt: r.claimed_at,
    };
    if (!today) return base;
    const { period, from } = periodOf(r, today);
    const p = progress(r, memberIds, from, today);
    let win = winFor.get(r.id, period) as WinRow | undefined;
    if (p.reachedOn && !win) {
      const id = randomUUID();
      db.prepare(`INSERT INTO reward_wins (id, reward_id, period, title, member_ids, goal, stars, earned_day)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, r.id, period, r.title, JSON.stringify(memberIds), r.goal, p.stars, p.reachedOn);
      win = winFor.get(r.id, period) as WinRow;
    } else if (!p.reachedOn && win && !win.given_at) {
      db.prepare('DELETE FROM reward_wins WHERE id = ?').run(win.id);
      win = undefined;
    } else if (win && !win.given_at && win.stars !== p.stars) {
      db.prepare('UPDATE reward_wins SET stars = ? WHERE id = ?').run(p.stars, win.id);
    }
    return {
      ...base, stars: p.stars, memberStars: p.memberStars,
      // in_progress, earned (waiting to be handed over), or given (this month's, for a monthly one).
      status: !win ? 'in_progress' : win.given_at ? 'given' : 'earned',
      winId: win?.id ?? null, earnedDay: win?.earned_day ?? null,
    };
  }

  const toWin = (w: WinRow) => ({
    id: w.id, rewardId: w.reward_id, period: w.period, title: w.title, memberIds: JSON.parse(w.member_ids) as string[],
    goal: w.goal, stars: w.stars, earnedDay: w.earned_day, givenAt: w.given_at,
  });

  /** Hands a win over; an until-earned reward then starts again (repeats) or is finished. */
  function give(win: WinRow, today: string) {
    db.transaction(() => {
      db.prepare(`UPDATE reward_wins SET given_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(win.id);
      const r = get(win.reward_id);
      if (!r || r.mode !== 'until_reached' || r.start_day !== win.period) return;
      if (r.repeats) db.prepare('UPDATE rewards SET start_day = ? WHERE id = ?').run(nextDay(today), r.id);
      else db.prepare(`UPDATE rewards SET claimed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(r.id);
    })();
  }

  const validMembers = (ids: string[]) => ids.every((id) => db.prepare('SELECT 1 FROM members WHERE id = ?').get(id));
  function setMembers(id: string, ids: string[]) {
    db.prepare('DELETE FROM reward_members WHERE reward_id = ?').run(id);
    const add = db.prepare('INSERT INTO reward_members (reward_id, member_id) VALUES (?, ?)');
    for (const m of ids) add.run(id, m);
    db.prepare('UPDATE rewards SET member_id = ? WHERE id = ?').run(ids[0], id);
  }

  // Rewards still going (not finished), with progress as of the display's `today`.
  app.get<{ Querystring: { today: string } }>('/api/rewards', {
    schema: { querystring: { type: 'object', required: ['today'], properties: { today: { type: 'string', pattern: DAY } } } },
  }, async (req) =>
    (db.prepare(`SELECT r.* FROM rewards r WHERE r.claimed_at IS NULL
      AND EXISTS (SELECT 1 FROM reward_members rm WHERE rm.reward_id = r.id) ORDER BY r.created_at`).all() as RewardRow[])
      .map((r) => toReward(r, req.query.today)));

  // Every reward earned: waiting to be given first, then the rest, newest first.
  app.get('/api/rewards/history', async () =>
    (db.prepare('SELECT * FROM reward_wins ORDER BY given_at IS NOT NULL, COALESCE(given_at, earned_day) DESC').all() as WinRow[])
      .map(toWin));

  app.post<{ Body: { memberId?: string; memberIds?: string[]; title: string; goal: number; mode: Mode; teamMode?: TeamMode;
    repeats?: boolean; startDay: string } }>('/api/rewards', {
    schema: { body: { type: 'object', required: ['title', 'goal', 'mode', 'startDay'], additionalProperties: false,
      properties: { ...PROPS, memberId: { type: 'string' }, startDay: { type: 'string', pattern: DAY } } } },
  }, async (req, reply) => {
    const ids = req.body.memberIds ?? (req.body.memberId ? [req.body.memberId] : []);
    if (!ids.length || !validMembers(ids)) return reply.code(400).send({ error: 'Unknown member' });
    const id = randomUUID();
    db.transaction(() => {
      db.prepare('INSERT INTO rewards (id, member_id, title, goal, mode, team_mode, repeats, start_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, ids[0], req.body.title.trim(), req.body.goal, req.body.mode, req.body.teamMode ?? 'pooled',
          req.body.repeats ? 1 : 0, req.body.startDay);
      setMembers(id, ids);
    })();
    reply.code(201);
    return toReward(get(id)!, req.body.startDay);
  });

  app.patch<{ Params: { id: string }; Body: { title?: string; goal?: number; mode?: Mode; teamMode?: TeamMode; repeats?: boolean;
    memberIds?: string[] } }>('/api/rewards/:id', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1, properties: PROPS } },
  }, async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Reward not found' });
    if (req.body.memberIds && !validMembers(req.body.memberIds)) return reply.code(400).send({ error: 'Unknown member' });
    db.transaction(() => {
      db.prepare('UPDATE rewards SET title = ?, goal = ?, mode = ?, team_mode = ?, repeats = ? WHERE id = ?')
        .run((req.body.title ?? row.title).trim(), req.body.goal ?? row.goal, req.body.mode ?? row.mode,
          req.body.teamMode ?? row.team_mode, req.body.repeats === undefined ? row.repeats : req.body.repeats ? 1 : 0, row.id);
      if (req.body.memberIds) setMembers(row.id, req.body.memberIds);
    })();
    return toReward(get(row.id)!);
  });

  // The reward was handed over. Marks its current win given (recording one if the goal wasn't
  // reached, when a parent gives it anyway).
  app.post<{ Params: { id: string }; Querystring: { today?: string } }>('/api/rewards/:id/given', async (req, reply) => {
    const r = get(req.params.id);
    if (!r || r.claimed_at) return reply.code(404).send({ error: 'Reward not found' });
    const today = req.query.today && new RegExp(DAY).test(req.query.today) ? req.query.today : new Date().toISOString().slice(0, 10);
    toReward(r, today);
    const { period } = periodOf(r, today);
    let win = winFor.get(r.id, period) as WinRow | undefined;
    if (!win) {
      const memberIds = membersOf(r.id);
      const p = progress(r, memberIds, periodOf(r, today).from, today);
      db.prepare(`INSERT INTO reward_wins (id, reward_id, period, title, member_ids, goal, stars, earned_day)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), r.id, period, r.title, JSON.stringify(memberIds), r.goal, p.stars, today);
      win = winFor.get(r.id, period) as WinRow;
    }
    if (!win.given_at) give(win, today);
    return reply.code(204).send();
  });

  // Hands over a past win (e.g. last month's, still waiting).
  app.post<{ Params: { id: string }; Querystring: { today?: string } }>('/api/rewards/wins/:id/given', async (req, reply) => {
    const win = db.prepare('SELECT * FROM reward_wins WHERE id = ? AND given_at IS NULL').get(req.params.id) as WinRow | undefined;
    if (!win) return reply.code(404).send({ error: 'Already given' });
    give(win, req.query.today && new RegExp(DAY).test(req.query.today) ? req.query.today : new Date().toISOString().slice(0, 10));
    return reply.code(204).send();
  });

  // Takes a hand-over back (tapped by mistake).
  app.post<{ Params: { id: string } }>('/api/rewards/wins/:id/undo', async (req, reply) => {
    const win = db.prepare('SELECT * FROM reward_wins WHERE id = ? AND given_at IS NOT NULL').get(req.params.id) as WinRow | undefined;
    if (!win) return reply.code(404).send({ error: 'Not given' });
    db.transaction(() => {
      db.prepare('UPDATE reward_wins SET given_at = NULL WHERE id = ?').run(win.id);
      // A finished until-earned reward comes back; a repeating one counts from that win again.
      const r = get(win.reward_id);
      if (r && r.mode === 'until_reached') db.prepare('UPDATE rewards SET claimed_at = NULL, start_day = ? WHERE id = ?').run(win.period, r.id);
    })();
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/rewards/:id', async (req, reply) => {
    const res = db.prepare('DELETE FROM rewards WHERE id = ?').run(req.params.id);
    if (res.changes === 0) return reply.code(404).send({ error: 'Reward not found' });
    // History stays, except a win not yet handed over (the reward is gone).
    db.prepare('DELETE FROM reward_wins WHERE reward_id = ? AND given_at IS NULL').run(req.params.id);
    return reply.code(204).send();
  });
}
