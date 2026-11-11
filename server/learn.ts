import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { DAY_VALUE } from './schemas.ts';
import { grownUpDevices, sendOnce, type Pusher } from './push.ts';
import { stageOf, type Stage } from './stages.ts';
import { ANIMALS, GAME_LEVELS, GAME_NAMES, type Game } from '../shared/learn.ts';
import { addTime, changeDay, learnDay } from './learnDay.ts';

// Learning (docs/kids-growth.md): short picture-first games in kid mode, with no fail states. A
// guardian turns it on for each kid, who then picks any of their stage's games. Each game has levels:
// a few perfect plays in a row move it up by itself (some games also after enough plays at a level:
// PLAYS_TO_MOVE_ON), and a guardian can move it up or down. The little ones' games (ASK_FIRST) don't
// move up by themselves: they're ready for the next level, and a grown-up moves them up. Each play is a new version of the game
// (the web picks it). It's for learning: it earns no stars.


/**
 * Each stage's games. Older stages play Early's for now. Find it! is hidden for now (2026-11-09): its
 * game and levels are kept, to put back in the list.
 */
const GAMES_FOR: Record<'little' | 'early', Game[]> = {
  little: ['sounds', 'peekaboo', 'pop', 'apples'],
  early: ['adding', 'maze', 'letters', 'memory'],
};
const gamesFor = (stage: Stage | null) => GAMES_FOR[stage === 'little' || stage === null ? 'little' : 'early'];

/** A recorded noise is a few seconds: well under this. */
const MAX_SOUND_BYTES = 1024 * 1024;

/** Perfect plays in a row, at a level, before the game moves up: 3, or as set here (null: never, only by count). */
const PLAYS_TO_LEVEL_UP = 3;
const PERFECT_RUN: Partial<Record<Game, number | null>> = { adding: 5, memory: 5, maze: null };
/** Some games also move up after this many plays at a level, perfect or not. */
const PLAYS_TO_MOVE_ON: Partial<Record<Game, number>> = { adding: 20, maze: 20, memory: 20 };
/** The little ones' (2) games, hidden ones too: ready for the next level, but only a grown-up moves them up. */
const ASK_FIRST: Game[] = ['sounds', 'peekaboo', 'findIt', 'apples', 'pop'];

interface KidRow { id: string; birthdate: string | null; stage: string | null; enabled: number | null }

export function registerLearn(app: FastifyInstance, db: DB, pusher?: Pusher) {
  // Recorded noises arrive as the audio itself (Safari records audio/mp4, most others audio/webm).
  app.addContentTypeParser(/^audio\//, { parseAs: 'buffer', bodyLimit: MAX_SOUND_BYTES }, (_req, body, done) => done(null, body));

  const kid = (id: string) => db.prepare(`SELECT m.id, m.birthdate, m.stage, k.enabled
    FROM members m LEFT JOIN learn_kids k ON k.member_id = m.id WHERE m.id = ?`).get(id) as KidRow | undefined;
  const stored = (memberId: string) => Object.fromEntries((db.prepare('SELECT skill, level, ready FROM learn_levels WHERE member_id = ?')
    .all(memberId) as { skill: Game; level: number; ready: number }[]).map((r) => [r.skill, r])) as Partial<Record<Game, { level: number; ready: number }>>;
  const levelOf = (memberId: string, game: Game) => Math.min(stored(memberId)[game]?.level ?? 1, GAME_LEVELS[game]);
  const isReady = (memberId: string, game: Game) => stored(memberId)[game]?.ready === 1 && levelOf(memberId, game) < GAME_LEVELS[game];
  // A grown-up (or the game itself) setting the level: no longer waiting to move up.
  const setLevel = (memberId: string, game: Game, level: number) => db.prepare(`INSERT INTO learn_levels (member_id, skill, level, since_play)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(rowid), 0) FROM learn_sessions))
    ON CONFLICT (member_id, skill) DO UPDATE SET level = excluded.level, since_play = excluded.since_play, ready = 0`).run(memberId, game, level);
  const markReady = (memberId: string, game: Game, level: number) => db.prepare(`INSERT INTO learn_levels (member_id, skill, level, ready)
    VALUES (?, ?, ?, 1) ON CONFLICT (member_id, skill) DO UPDATE SET ready = 1`).run(memberId, game, level);

  function state(r: KidRow, today: string) {
    const games = gamesFor(stageOf(r, today));
    return {
      memberId: r.id,
      enabled: r.enabled === 1,
      // Their stage's games, each at the level they'd play it, its highest, and whether it's waiting for a
      // grown-up to move it up.
      games: games.map((game) => ({ game, level: levelOf(r.id, game), maxLevel: GAME_LEVELS[game], ready: isReady(r.id, game) })),
      // Today's Learn: games and time used and allowed, and whether a game can start (learnDay.ts).
      today: learnDay(db, r.id, today),
    };
  }

  // Each kid's learning: on or off, and their games' levels.
  app.get<{ Querystring: { today: string } }>('/api/learn', {
    schema: { querystring: { type: 'object', required: ['today'], properties: { today: DAY_VALUE } } },
  }, async (req) => {
    const rows = db.prepare(`SELECT m.id, m.birthdate, m.stage, k.enabled
      FROM members m LEFT JOIN learn_kids k ON k.member_id = m.id ORDER BY m.sort_order, m.created_at`).all() as KidRow[];
    return rows.filter((r) => { const s = stageOf(r, req.query.today); return s !== null && s !== 'adult'; })
      .map((r) => state(r, req.query.today));
  });

  // A guardian turns learning on or off for a kid, sets their games and minutes a day (null minutes: no
  // time limit), and moves games' levels up or down.
  app.put<{ Params: { memberId: string }; Body: { enabled?: boolean; gamesADay?: number; minutesADay?: number | null;
    levels?: Partial<Record<Game, number>>; today: string } }>(
    '/api/learn/:memberId', {
      schema: { body: { type: 'object', required: ['today'], additionalProperties: false, minProperties: 2, properties: {
        enabled: { type: 'boolean' }, today: DAY_VALUE,
        gamesADay: { type: 'integer', minimum: 1, maximum: 10 },
        minutesADay: { anyOf: [{ type: 'integer', minimum: 5, maximum: 240 }, { type: 'null' }] },
        levels: { type: 'object', additionalProperties: { type: 'integer', minimum: 1, maximum: 9 } } } } },
    }, async (req, reply) => {
      const r = kid(req.params.memberId);
      if (!r) return reply.code(404).send({ error: 'Member not found' });
      const { today } = req.body;
      const stage = stageOf(r, today);
      if (stage === null || stage === 'adult') return reply.code(400).send({ error: 'Learning is for the kids' });
      const levels = Object.entries(req.body.levels ?? {}) as [Game, number][];
      if (levels.some(([g, n]) => !gamesFor(stage).includes(g) || n > GAME_LEVELS[g])) return reply.code(400).send({ error: 'No such level' });
      db.transaction(() => {
        if (req.body.enabled !== undefined) {
          db.prepare(`INSERT INTO learn_kids (member_id, enabled) VALUES (?, ?)
            ON CONFLICT (member_id) DO UPDATE SET enabled = excluded.enabled`).run(r.id, req.body.enabled ? 1 : 0);
        }
        const limits = db.prepare('INSERT OR IGNORE INTO learn_kids (member_id) VALUES (?)');
        if (req.body.gamesADay !== undefined) {
          limits.run(r.id);
          db.prepare('UPDATE learn_kids SET games_a_day = ? WHERE member_id = ?').run(req.body.gamesADay, r.id);
        }
        if (req.body.minutesADay !== undefined) {
          limits.run(r.id);
          db.prepare('UPDATE learn_kids SET minutes_a_day = ? WHERE member_id = ?').run(req.body.minutesADay, r.id);
        }
        for (const [game, level] of levels) setLevel(r.id, game, level);
      })();
      return state(kid(r.id)!, today);
    });

  // A grown-up's change to a kid's day (parent-only, auth.ts): unlock or lock today (null: back to opening
  // once the Daily tasks are done), or give them more games or minutes.
  app.post<{ Params: { memberId: string }; Body: { today: string; open?: boolean | null; moreGames?: boolean; moreMinutes?: boolean } }>(
    '/api/learn/:memberId/today', {
      schema: { body: { type: 'object', required: ['today'], additionalProperties: false, minProperties: 2, properties: {
        today: DAY_VALUE, open: { type: ['boolean', 'null'] }, moreGames: { const: true }, moreMinutes: { const: true } } } },
    }, async (req, reply) => {
      const r = kid(req.params.memberId);
      if (!r) return reply.code(404).send({ error: 'Member not found' });
      changeDay(db, r.id, req.body.today, req.body);
      return state(kid(r.id)!, req.body.today);
    });

  // Time spent in a game, sent every so often while they play and when they leave it (for a time limit).
  app.post<{ Params: { memberId: string }; Body: { today: string; seconds: number } }>(
    '/api/learn/:memberId/time', {
      schema: { body: { type: 'object', required: ['today', 'seconds'], additionalProperties: false, properties: {
        today: DAY_VALUE, seconds: { type: 'integer', minimum: 1, maximum: 600 } } } },
    }, async (req, reply) => {
      const r = kid(req.params.memberId);
      if (!r) return reply.code(404).send({ error: 'Member not found' });
      if (req.raw.viewer?.role === 'kid' && req.raw.viewer.memberId !== r.id) return reply.code(403).send({ error: 'Not your activity' });
      addTime(db, r.id, req.body.today, req.body.seconds);
      return state(kid(r.id)!, req.body.today);
    });

  // A finished game: rounds played and how many were right the first time. The last few plays at its
  // level all perfect moves it up (a little one's: makes it ready, for a grown-up to move up).
  app.post<{ Params: { memberId: string }; Body: { today: string; game: Game; level: number; rounds: number; firstTry: number } }>(
    '/api/learn/:memberId/done', {
      schema: { body: { type: 'object', required: ['today', 'game', 'level', 'rounds', 'firstTry'], additionalProperties: false, properties: {
        today: DAY_VALUE, game: { enum: Object.keys(GAME_LEVELS) },
        level: { type: 'integer', minimum: 1, maximum: 9 }, rounds: { type: 'integer', minimum: 1, maximum: 50 },
        firstTry: { type: 'integer', minimum: 0, maximum: 50 } } } },
    }, async (req, reply) => {
      const r = kid(req.params.memberId);
      if (!r) return reply.code(404).send({ error: 'Member not found' });
      const viewer = req.raw.viewer;
      // A kid's own device plays as that kid.
      if (viewer?.role === 'kid' && viewer.memberId !== r.id) return reply.code(403).send({ error: 'Not your activity' });
      if (!r.enabled) return reply.code(409).send({ error: 'Learning is off for this kid' });
      const { today, game, level, rounds } = req.body;
      if (!gamesFor(stageOf(r, today)).includes(game)) return reply.code(400).send({ error: 'Not one of their games' });
      const firstTry = Math.min(req.body.firstTry, rounds);
      let nowReady = false;
      const leveledUp = db.transaction(() => {
        db.prepare(`INSERT INTO learn_sessions (id, member_id, day, skill, level, rounds, first_try) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), r.id, today, game, level, rounds, firstTry);
        const at = levelOf(r.id, game);
        if (level !== at || at >= GAME_LEVELS[game] || isReady(r.id, game)) return false;
        // The plays at this level since it was set or moved up to, latest first.
        const plays = db.prepare(`SELECT s.first_try = s.rounds AS perfect FROM learn_sessions s
          LEFT JOIN learn_levels l ON l.member_id = s.member_id AND l.skill = s.skill
          WHERE s.member_id = ? AND s.skill = ? AND s.level = ? AND s.rowid > COALESCE(l.since_play, 0)
          ORDER BY s.rowid DESC`)
          .all(r.id, game, at) as { perfect: number }[];
        const run = PERFECT_RUN[game] === undefined ? PLAYS_TO_LEVEL_UP : PERFECT_RUN[game];
        const perfectRun = run !== null && plays.length >= run && plays.slice(0, run).every((p) => p.perfect);
        const playedEnough = PLAYS_TO_MOVE_ON[game] !== undefined && plays.length >= PLAYS_TO_MOVE_ON[game]!;
        if (!perfectRun && !playedEnough) return false;
        if (ASK_FIRST.includes(game)) {
          markReady(r.id, game, at);
          nowReady = true;
          return false;
        }
        setLevel(r.id, game, at + 1);
        return true;
      })();
      // Moved up to the top level: a heads-up to the grown-ups, so they know it's time for more.
      const top = leveledUp && levelOf(r.id, game) >= GAME_LEVELS[game];
      if (top && pusher) {
        const { name } = db.prepare('SELECT name FROM members WHERE id = ?').get(r.id) as { name: string };
        void sendOnce(db, pusher, grownUpDevices(db), `learn-top:${r.id}:${game}:${randomUUID()}`, {
          title: `🌱 ${name.split(' ')[0]} has reached the top of ${GAME_NAMES[game]}`,
          body: `Level ${GAME_LEVELS[game]} of ${GAME_LEVELS[game]}. Time to ask for more levels.`,
          url: '/', tag: `learn-top:${r.id}:${game}`,
        }, req.log);
      }
      // Ready for the next level: a heads-up to the grown-ups, to move it up when they think so.
      if (nowReady && pusher) {
        const { name } = db.prepare('SELECT name FROM members WHERE id = ?').get(r.id) as { name: string };
        const next = levelOf(r.id, game) + 1;
        void sendOnce(db, pusher, grownUpDevices(db), `learn-ready:${r.id}:${game}:${randomUUID()}`, {
          title: `🌱 ${name.split(' ')[0]} is ready for level ${next} of ${GAME_NAMES[game]}`,
          body: 'Move it up in Settings, Learning, when you think so.',
          url: '/', tag: `learn-ready:${r.id}:${game}`,
        }, req.log);
      }
      return { leveledUp, ...state(kid(r.id)!, today) };
    });

  // Animal noises a grown-up recorded: which, and when (so a new recording isn't the old one cached).
  app.get('/api/learn/sounds', async () =>
    db.prepare('SELECT animal, updated_at AS version FROM learn_sounds ORDER BY animal').all());

  app.get<{ Params: { animal: string } }>('/api/learn/sounds/:animal', async (req, reply) => {
    const row = db.prepare('SELECT mime, audio FROM learn_sounds WHERE animal = ?').get(req.params.animal) as { mime: string; audio: Buffer } | undefined;
    if (!row) return reply.code(404).send({ error: 'Not recorded' });
    return reply.type(row.mime).header('cache-control', 'private, max-age=31536000, immutable').send(row.audio);
  });

  // A grown-up records one (the body is the audio), or deletes it to go back to the built-in noise.
  app.put<{ Params: { animal: string } }>('/api/learn/sounds/:animal', { bodyLimit: MAX_SOUND_BYTES }, async (req, reply) => {
    if (!ANIMALS.some((a) => a.id === req.params.animal)) return reply.code(404).send({ error: 'No such animal' });
    const mime = String(req.headers['content-type'] ?? '').split(';')[0];
    if (!/^audio\/[\w.+-]+$/.test(mime) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return reply.code(400).send({ error: 'Send the recording as audio' });
    }
    db.prepare(`INSERT INTO learn_sounds (animal, mime, audio) VALUES (?, ?, ?)
      ON CONFLICT (animal) DO UPDATE SET mime = excluded.mime, audio = excluded.audio, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .run(req.params.animal, mime, req.body);
    return db.prepare('SELECT animal, updated_at AS version FROM learn_sounds WHERE animal = ?').get(req.params.animal);
  });

  app.delete<{ Params: { animal: string } }>('/api/learn/sounds/:animal', async (req, reply) => {
    db.prepare('DELETE FROM learn_sounds WHERE animal = ?').run(req.params.animal);
    return reply.code(204).send();
  });
}
