import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { parentPin } from './auth.ts';

// Reward jars. Each kid has a bucket: every star earned from extras, minus what they've put in jars.
// Parents make the jars; kids drop stars in and can't take them back out. A jar is
//   filling   until it's full: everyone's stars together (pooled), or every kid the full amount (each)
//   earned    full, waiting to be redeemed (a reward_wins row); off the jar list until then
//   redeemed  its stars are spent. A jar without a deadline empties and fills again; one with a
//             deadline is finished.
//   missed    its deadline passed before it was redeemed. Each kid moves their stars back to their
//             bucket or into another jar; once it's empty, a parent adds it back or removes it.
// Stars not yet redeemed go back to the kids when a jar is deleted, made smaller, or a kid is taken off it,
// and a parent (with the master PIN) can take a kid's stars back out of a jar.

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
type TeamMode = 'pooled' | 'each';
interface RewardRow {
  id: string; title: string; goal: number; team_mode: TeamMode; deadline: string | null; missed_at: string | null;
  created_at: string; claimed_at: string | null;
}
interface WinRow {
  id: string; reward_id: string; title: string; member_ids: string; goal: number; stars: number;
  earned_day: string; given_at: string | null; missed_on: string | null;
}
interface JarRow { id: string; member_id: string; stars: number }
/** A request that can't be done, with the reason to show. */
class Refused extends Error {}

const PROPS = {
  title: { type: 'string', minLength: 1, maxLength: 80 },
  goal: { type: 'integer', minimum: 1, maximum: 100000 },
  teamMode: { enum: ['pooled', 'each'] },
  memberIds: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true, items: { type: 'string' } },
  deadline: { type: ['string', 'null'], pattern: DAY },
} as const;
const TODAY = { type: 'string', pattern: DAY } as const;
const dayOr = (d?: string) => (d && new RegExp(DAY).test(d) ? d : new Date().toISOString().slice(0, 10));
const sum = (stars: Record<string, number>) => Object.values(stars).reduce((a, n) => a + n, 0);

/** Stars a kid can still put in jars: everything earned from extras, minus what's in jars. */
export function bucket(db: DB, memberId: string) {
  return (db.prepare(`SELECT (SELECT COALESCE(SUM(points), 0) FROM task_done WHERE member_id = @m)
    - (SELECT COALESCE(SUM(stars), 0) FROM jar_stars WHERE member_id = @m) AS n`).get({ m: memberId }) as { n: number }).n;
}

/** Takes up to `n` stars out of one jar row; returns how many. */
function takeBack(db: DB, row: JarRow, n: number) {
  const k = Math.min(row.stars, n);
  if (k === row.stars) db.prepare('DELETE FROM jar_stars WHERE id = ?').run(row.id);
  else db.prepare('UPDATE jar_stars SET stars = stars - ? WHERE id = ?').run(k, row.id);
  return k;
}

/** Stars were taken away (a task deleted): takes the kid's newest stars back out of jars so the bucket isn't below zero. */
export function coverShortfall(db: DB, memberId: string) {
  let short = -bucket(db, memberId);
  const rows = db.prepare('SELECT id, member_id, stars FROM jar_stars WHERE member_id = ? AND win_id IS NULL ORDER BY rowid DESC')
    .all(memberId) as JarRow[];
  for (const row of rows) {
    if (short <= 0) break;
    short -= takeBack(db, row, short);
  }
}

export function registerRewards(app: FastifyInstance, db: DB) {
  const get = (id: string) => db.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as RewardRow | undefined;
  const membersOf = (id: string) => (db.prepare(`SELECT rm.member_id FROM reward_members rm JOIN members m ON m.id = rm.member_id
    WHERE rm.reward_id = ? ORDER BY m.sort_order, m.created_at`).all(id) as { member_id: string }[]).map((r) => r.member_id);
  const byMember = (rows: { member_id: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.member_id, r.n])) as Record<string, number>;
  /** Each kid's stars in a jar now (not counting a full one waiting to be redeemed). */
  const held = (id: string) => byMember(db.prepare(`SELECT member_id, SUM(stars) AS n FROM jar_stars
    WHERE reward_id = ? AND win_id IS NULL GROUP BY member_id`).all(id) as { member_id: string; n: number }[]);
  /** The jar's win waiting to be redeemed, if it's full. */
  const waiting = (id: string) =>
    db.prepare('SELECT * FROM reward_wins WHERE reward_id = ? AND given_at IS NULL AND missed_on IS NULL').get(id) as WinRow | undefined;
  const isEach = (r: RewardRow, ids: string[]) => r.team_mode === 'each' && ids.length > 1;

  /** Stars that no longer fit go back: anyone taken off the jar, then the newest stars over the goal. */
  function trim(r: RewardRow) {
    const ids = membersOf(r.id);
    db.prepare(`DELETE FROM jar_stars WHERE reward_id = ? AND win_id IS NULL
      AND member_id NOT IN (SELECT member_id FROM reward_members WHERE reward_id = ?)`).run(r.id, r.id);
    const each = isEach(r, ids);
    const h = held(r.id);
    // How far over the goal: each kid's own stars (each), or everyone's together.
    const over: Record<string, number> = each ? Object.fromEntries(ids.map((m) => [m, (h[m] ?? 0) - r.goal])) : { all: sum(h) - r.goal };
    const rows = db.prepare('SELECT id, member_id, stars FROM jar_stars WHERE reward_id = ? AND win_id IS NULL ORDER BY rowid DESC')
      .all(r.id) as JarRow[];
    for (const row of rows) {
      const key = each ? row.member_id : 'all';
      if (over[key] > 0) over[key] -= takeBack(db, row, over[key]);
    }
  }

  /** A full jar is earned: its stars go with the win, and it waits to be redeemed. */
  function fill(r: RewardRow, today: string) {
    if (r.missed_at || waiting(r.id)) return;
    const ids = membersOf(r.id);
    const h = held(r.id);
    if (!(isEach(r, ids) ? ids.every((m) => (h[m] ?? 0) >= r.goal) : sum(h) >= r.goal)) return;
    const id = randomUUID();
    db.prepare(`INSERT INTO reward_wins (id, reward_id, period, title, member_ids, goal, stars, earned_day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, r.id, id, r.title, JSON.stringify(ids), r.goal, sum(h), today);
    db.prepare('UPDATE jar_stars SET win_id = ? WHERE reward_id = ? AND win_id IS NULL').run(id, r.id);
  }

  /** Past its deadline and not redeemed: the jar is missed, and any stars in it are the kids' to move. */
  function checkDeadline(r: RewardRow, today: string) {
    if (!r.deadline || today <= r.deadline || r.missed_at || r.claimed_at) return;
    db.transaction(() => {
      const win = waiting(r.id);
      if (win) {
        db.prepare('UPDATE reward_wins SET missed_on = ? WHERE id = ?').run(r.deadline, win.id);
        db.prepare('UPDATE jar_stars SET win_id = NULL WHERE win_id = ?').run(win.id);
      } else {
        // Kept in the history as missed (earned_day holds the deadline).
        const id = randomUUID();
        db.prepare(`INSERT INTO reward_wins (id, reward_id, period, title, member_ids, goal, stars, earned_day, missed_on)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, r.id, id, r.title, JSON.stringify(membersOf(r.id)), r.goal, sum(held(r.id)), r.deadline, r.deadline);
      }
      db.prepare('UPDATE rewards SET missed_at = ? WHERE id = ?').run(today, r.id);
    })();
  }

  const toReward = (r: RewardRow) => {
    const memberStars = held(r.id);
    return {
      id: r.id, memberIds: membersOf(r.id), title: r.title, goal: r.goal, teamMode: r.team_mode, deadline: r.deadline,
      stars: sum(memberStars), memberStars,
      status: r.missed_at ? 'missed' : waiting(r.id) ? 'earned' : 'filling',
    };
  };

  const winStars = db.prepare('SELECT member_id, SUM(stars) AS n FROM jar_stars WHERE win_id = ? GROUP BY member_id');
  const toWin = (w: WinRow) => ({
    id: w.id, rewardId: w.reward_id, title: w.title, memberIds: JSON.parse(w.member_ids) as string[], goal: w.goal, stars: w.stars,
    memberStars: byMember(winStars.all(w.id) as { member_id: string; n: number }[]),
    earnedDay: w.earned_day, givenAt: w.given_at, missedOn: w.missed_on,
  });

  const validMembers = (ids: string[]) => ids.every((id) => db.prepare('SELECT 1 FROM members WHERE id = ?').get(id));
  function setMembers(id: string, ids: string[]) {
    db.prepare('DELETE FROM reward_members WHERE reward_id = ?').run(id);
    const add = db.prepare('INSERT INTO reward_members (reward_id, member_id) VALUES (?, ?)');
    for (const m of ids) add.run(id, m);
    db.prepare('UPDATE rewards SET member_id = ? WHERE id = ?').run(ids[0], id);
  }
  const open = () => db.prepare(`SELECT r.* FROM rewards r WHERE r.claimed_at IS NULL
    AND EXISTS (SELECT 1 FROM reward_members rm WHERE rm.reward_id = r.id) ORDER BY r.created_at`).all() as RewardRow[];

  // Jars still going (filling, earned or missed), as of the display's `today`.
  app.get<{ Querystring: { today: string } }>('/api/rewards', {
    schema: { querystring: { type: 'object', required: ['today'], properties: { today: TODAY } } },
  }, async (req) => {
    for (const r of open()) checkDeadline(r, req.query.today);
    return open().map(toReward);
  });

  // Each kid's bucket: stars earned from extras and not in a jar.
  app.get('/api/rewards/buckets', async () =>
    (db.prepare('SELECT id FROM members ORDER BY sort_order, created_at').all() as { id: string }[])
      .map((m) => ({ memberId: m.id, stars: bucket(db, m.id) })));

  // Every jar filled or missed: waiting to be redeemed first, then the rest, newest first.
  app.get('/api/rewards/history', async () =>
    (db.prepare(`SELECT * FROM reward_wins
      ORDER BY given_at IS NOT NULL OR missed_on IS NOT NULL, COALESCE(given_at, missed_on, earned_day) DESC`).all() as WinRow[])
      .map(toWin));

  app.post<{ Body: { memberIds: string[]; title: string; goal: number; teamMode?: TeamMode; deadline?: string | null; today: string } }>(
    '/api/rewards', {
      schema: { body: { type: 'object', required: ['memberIds', 'title', 'goal', 'today'], additionalProperties: false,
        properties: { ...PROPS, today: TODAY } } },
    }, async (req, reply) => {
      const { memberIds, today, deadline = null } = req.body;
      if (!validMembers(memberIds)) return reply.code(400).send({ error: 'Unknown member' });
      if (deadline && deadline < today) return reply.code(400).send({ error: 'That deadline has already passed' });
      const id = randomUUID();
      db.transaction(() => {
        db.prepare(`INSERT INTO rewards (id, member_id, title, goal, mode, team_mode, start_day, deadline)
          VALUES (?, ?, ?, ?, 'until_reached', ?, ?, ?)`)
          .run(id, memberIds[0], req.body.title.trim(), req.body.goal, req.body.teamMode ?? 'pooled', today, deadline);
        setMembers(id, memberIds);
      })();
      reply.code(201);
      return toReward(get(id)!);
    });

  app.patch<{ Params: { id: string }; Querystring: { today?: string };
    Body: { title?: string; goal?: number; teamMode?: TeamMode; memberIds?: string[]; deadline?: string | null } }>('/api/rewards/:id', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1, properties: PROPS } },
  }, async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Jar not found' });
    if (req.body.memberIds && !validMembers(req.body.memberIds)) return reply.code(400).send({ error: 'Unknown member' });
    const today = dayOr(req.query.today);
    const { deadline } = req.body;
    if (deadline && deadline !== row.deadline && deadline < today) return reply.code(400).send({ error: 'That deadline has already passed' });
    db.transaction(() => {
      db.prepare('UPDATE rewards SET title = ?, goal = ?, team_mode = ?, deadline = ? WHERE id = ?')
        .run((req.body.title ?? row.title).trim(), req.body.goal ?? row.goal, req.body.teamMode ?? row.team_mode,
          deadline === undefined ? row.deadline : deadline, row.id);
      if (req.body.memberIds) setMembers(row.id, req.body.memberIds);
      // Made smaller (or someone taken off): stars that don't fit go back; it may now be full.
      trim(get(row.id)!);
      fill(get(row.id)!, today);
    })();
    return toReward(get(row.id)!);
  });

  // A kid puts stars in jars, all at once: from their bucket, or (with `from`) taking their stars
  // out of a missed jar first. With `from` and no places, the stars just go back to the bucket.
  app.post<{ Body: { memberId: string; today: string; from?: string; places: { rewardId: string; stars: number }[] } }>(
    '/api/rewards/place', {
      schema: { body: { type: 'object', required: ['memberId', 'today', 'places'], additionalProperties: false, properties: {
        memberId: { type: 'string' }, today: TODAY, from: { type: 'string' },
        places: { type: 'array', maxItems: 50, items: { type: 'object', required: ['rewardId', 'stars'], additionalProperties: false,
          properties: { rewardId: { type: 'string' }, stars: { type: 'integer', minimum: 1, maximum: 100000 } } } },
      } } },
    }, async (req, reply) => {
      const { memberId, today, from, places } = req.body;
      if (!validMembers([memberId])) return reply.code(400).send({ error: 'Unknown member' });
      try {
        db.transaction(() => {
          if (from) {
            if (!get(from)?.missed_at) throw new Refused('That jar is still open');
            db.prepare('DELETE FROM jar_stars WHERE reward_id = ? AND member_id = ? AND win_id IS NULL').run(from, memberId);
          }
          const add = db.prepare('INSERT INTO jar_stars (id, reward_id, member_id, stars) VALUES (?, ?, ?, ?)');
          for (const p of places) {
            const before = get(p.rewardId);
            const ids = before ? membersOf(before.id) : [];
            if (!before || before.claimed_at || !ids.includes(memberId)) throw new Refused('That jar is gone');
            checkDeadline(before, today);
            const r = get(before.id)!;
            if (r.missed_at) throw new Refused(`${r.title} is past its deadline`);
            if (waiting(r.id)) throw new Refused(`${r.title} is already full`);
            const h = held(r.id);
            const room = r.goal - (isEach(r, ids) ? (h[memberId] ?? 0) : sum(h));
            if (p.stars > room) throw new Refused(`${r.title} only has room for ${room} more`);
            add.run(randomUUID(), r.id, memberId, p.stars);
          }
          if (bucket(db, memberId) < 0) throw new Refused("There aren't that many stars in the bucket");
          for (const p of places) fill(get(p.rewardId)!, today);
        })();
      } catch (e) {
        if (e instanceof Refused) return reply.code(400).send({ error: e.message });
        throw e;
      }
      return reply.code(204).send();
    });

  // A missed jar goes back on the list, with a new deadline or none.
  app.post<{ Params: { id: string }; Body: { deadline: string | null; today: string } }>('/api/rewards/:id/restore', {
    schema: { body: { type: 'object', required: ['deadline', 'today'], additionalProperties: false,
      properties: { deadline: PROPS.deadline, today: TODAY } } },
  }, async (req, reply) => {
    const r = get(req.params.id);
    if (!r?.missed_at) return reply.code(404).send({ error: 'Jar not found' });
    const { deadline, today } = req.body;
    if (deadline && deadline < today) return reply.code(400).send({ error: 'That deadline has already passed' });
    db.transaction(() => {
      db.prepare('UPDATE rewards SET missed_at = NULL, deadline = ? WHERE id = ?').run(deadline, r.id);
      fill(get(r.id)!, today);
    })();
    return toReward(get(r.id)!);
  });

  // A parent takes some of a kid's stars back out of a jar, into their bucket (newest first). A full
  // jar not yet redeemed is then filling again.
  const checkPin = parentPin(db);
  app.post<{ Params: { id: string }; Body: { memberId: string; stars: number; pin: string } }>('/api/rewards/:id/take-back', {
    schema: { body: { type: 'object', required: ['memberId', 'stars', 'pin'], additionalProperties: false, properties: {
      memberId: { type: 'string' }, stars: { type: 'integer', minimum: 1, maximum: 100000 }, pin: { type: 'string', minLength: 1, maxLength: 64 },
    } } },
  }, async (req, reply) => {
    const r = get(req.params.id);
    if (!r) return reply.code(404).send({ error: 'Jar not found' });
    // 403, not 401: a wrong PIN here doesn't sign the device out.
    const wrong = checkPin(req.body.pin, req.ip);
    if (wrong) return reply.code(403).send({ error: wrong });
    const { memberId, stars } = req.body;
    try {
      db.transaction(() => {
        const win = waiting(r.id);
        if (win) {
          db.prepare('UPDATE jar_stars SET win_id = NULL WHERE win_id = ?').run(win.id);
          db.prepare('DELETE FROM reward_wins WHERE id = ?').run(win.id);
        }
        const rows = db.prepare('SELECT id, member_id, stars FROM jar_stars WHERE reward_id = ? AND member_id = ? AND win_id IS NULL ORDER BY rowid DESC')
          .all(r.id, memberId) as JarRow[];
        if (rows.reduce((a, row) => a + row.stars, 0) < stars) throw new Refused("There aren't that many of their stars in it");
        let left = stars;
        for (const row of rows) if (left > 0) left -= takeBack(db, row, left);
      })();
    } catch (e) {
      if (e instanceof Refused) return reply.code(400).send({ error: e.message });
      throw e;
    }
    return reply.code(204).send();
  });

  // Redeemed: the jar's stars are spent. One with a deadline is finished; the others empty and fill again.
  app.post<{ Params: { id: string } }>('/api/rewards/wins/:id/given', async (req, reply) => {
    const win = db.prepare('SELECT * FROM reward_wins WHERE id = ? AND given_at IS NULL AND missed_on IS NULL')
      .get(req.params.id) as WinRow | undefined;
    if (!win) return reply.code(404).send({ error: 'Already redeemed' });
    db.transaction(() => {
      db.prepare(`UPDATE reward_wins SET given_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(win.id);
      db.prepare(`UPDATE rewards SET claimed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deadline IS NOT NULL`)
        .run(win.reward_id);
    })();
    return reply.code(204).send();
  });

  // Takes a redeem back (tapped by mistake): it's waiting again, and a finished jar comes back.
  app.post<{ Params: { id: string } }>('/api/rewards/wins/:id/undo', async (req, reply) => {
    const win = db.prepare('SELECT * FROM reward_wins WHERE id = ? AND given_at IS NOT NULL').get(req.params.id) as WinRow | undefined;
    if (!win) return reply.code(404).send({ error: 'Not redeemed' });
    db.transaction(() => {
      db.prepare('UPDATE reward_wins SET given_at = NULL WHERE id = ?').run(win.id);
      db.prepare('UPDATE rewards SET claimed_at = NULL WHERE id = ?').run(win.reward_id);
    })();
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/rewards/:id', async (req, reply) => {
    if (!get(req.params.id)) return reply.code(404).send({ error: 'Jar not found' });
    db.transaction(() => {
      // Stars not yet redeemed go back to the kids, and a full one waiting is no longer owed.
      // Redeemed and missed ones stay in the history.
      db.prepare(`DELETE FROM jar_stars WHERE reward_id = ?
        AND (win_id IS NULL OR win_id IN (SELECT id FROM reward_wins WHERE given_at IS NULL))`).run(req.params.id);
      db.prepare('DELETE FROM reward_wins WHERE reward_id = ? AND given_at IS NULL AND missed_on IS NULL').run(req.params.id);
      db.prepare('DELETE FROM rewards WHERE id = ?').run(req.params.id);
    })();
    return reply.code(204).send();
  });
}
