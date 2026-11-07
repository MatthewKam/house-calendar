import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { stageOf, type Stage } from './stages.ts';

// Learning (docs/kids-growth.md): short picture-first games in kid mode, with no fail states. A
// guardian turns it on for each kid, who then picks any of their stage's games. Each game has levels:
// a few perfect plays in a row move it up by itself (Math also after 20 plays at a level), and a
// guardian can move it up or down. Each play is a new version of the game (the web picks it). It's
// for learning: it earns no stars.

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';

/** The games, and the highest level each has. */
export const GAMES = {
  // Little (2): who says that, peekaboo farm, find it, count the apples.
  sounds: 6, peekaboo: 6, findIt: 6, apples: 6,
  // Early (4) and up: add them up, Bear's way home, the missing first letter, card matching.
  adding: 6, maze: 6, letters: 6, memory: 6,
} as const;
export type Game = keyof typeof GAMES;

/** Each stage's games. Older stages play Early's for now. */
const GAMES_FOR: Record<'little' | 'early', Game[]> = {
  little: ['sounds', 'peekaboo', 'findIt', 'apples'],
  early: ['adding', 'maze', 'letters', 'memory'],
};
export const gamesFor = (stage: Stage | null) => GAMES_FOR[stage === 'little' || stage === null ? 'little' : 'early'];

/** The animals with a noise (web/src/components/learn/things.ts), which a grown-up can record their own of. */
export const ANIMALS = ['cow', 'pig', 'duck', 'sheep', 'horse', 'chicken', 'goat', 'dog', 'cat', 'mouse', 'frog', 'owl', 'bee', 'lion', 'elephant', 'monkey'];
/** A recorded noise is a few seconds: well under this. */
const MAX_SOUND_BYTES = 1024 * 1024;

/** Perfect plays in a row, at a level, before the game moves up. */
export const PLAYS_TO_LEVEL_UP = 3;
/** Some games also move up after this many plays at a level, perfect or not (Math: 20 games of 3 rounds). */
export const PLAYS_TO_MOVE_ON: Partial<Record<Game, number>> = { adding: 20 };

interface KidRow { id: string; birthdate: string | null; stage: string | null; enabled: number | null }

export function registerLearn(app: FastifyInstance, db: DB) {
  // Recorded noises arrive as the audio itself (Safari records audio/mp4, most others audio/webm).
  app.addContentTypeParser(/^audio\//, { parseAs: 'buffer', bodyLimit: MAX_SOUND_BYTES }, (_req, body, done) => done(null, body));

  const kid = (id: string) => db.prepare(`SELECT m.id, m.birthdate, m.stage, k.enabled
    FROM members m LEFT JOIN learn_kids k ON k.member_id = m.id WHERE m.id = ?`).get(id) as KidRow | undefined;
  const stored = (memberId: string) => Object.fromEntries((db.prepare('SELECT skill, level FROM learn_levels WHERE member_id = ?')
    .all(memberId) as { skill: Game; level: number }[]).map((r) => [r.skill, r.level])) as Partial<Record<Game, number>>;
  const levelOf = (memberId: string, game: Game) => Math.min(stored(memberId)[game] ?? 1, GAMES[game]);
  const setLevel = (memberId: string, game: Game, level: number) => db.prepare(`INSERT INTO learn_levels (member_id, skill, level, since_play)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(rowid), 0) FROM learn_sessions))
    ON CONFLICT (member_id, skill) DO UPDATE SET level = excluded.level, since_play = excluded.since_play`).run(memberId, game, level);

  function state(r: KidRow, today: string) {
    const games = gamesFor(stageOf(r, today));
    return {
      memberId: r.id,
      enabled: r.enabled === 1,
      // Their stage's games, each at the level they'd play it, and its highest.
      games: games.map((game) => ({ game, level: levelOf(r.id, game), maxLevel: GAMES[game] })),
    };
  }

  // Each kid's learning: on or off, and their games' levels.
  app.get<{ Querystring: { today: string } }>('/api/learn', {
    schema: { querystring: { type: 'object', required: ['today'], properties: { today: { type: 'string', pattern: DAY } } } },
  }, async (req) => {
    const rows = db.prepare(`SELECT m.id, m.birthdate, m.stage, k.enabled
      FROM members m LEFT JOIN learn_kids k ON k.member_id = m.id ORDER BY m.sort_order, m.created_at`).all() as KidRow[];
    return rows.filter((r) => { const s = stageOf(r, req.query.today); return s !== null && s !== 'adult'; })
      .map((r) => state(r, req.query.today));
  });

  // A guardian turns learning on or off for a kid, and moves games' levels up or down.
  app.put<{ Params: { memberId: string }; Body: { enabled?: boolean; levels?: Partial<Record<Game, number>>; today: string } }>(
    '/api/learn/:memberId', {
      schema: { body: { type: 'object', required: ['today'], additionalProperties: false, minProperties: 2, properties: {
        enabled: { type: 'boolean' }, today: { type: 'string', pattern: DAY },
        levels: { type: 'object', additionalProperties: { type: 'integer', minimum: 1, maximum: 9 } } } } },
    }, async (req, reply) => {
      const r = kid(req.params.memberId);
      if (!r) return reply.code(404).send({ error: 'Member not found' });
      const { today } = req.body;
      const stage = stageOf(r, today);
      if (stage === null || stage === 'adult') return reply.code(400).send({ error: 'Learning is for the kids' });
      const levels = Object.entries(req.body.levels ?? {}) as [Game, number][];
      if (levels.some(([g, n]) => !gamesFor(stage).includes(g) || n > GAMES[g])) return reply.code(400).send({ error: 'No such level' });
      db.transaction(() => {
        if (req.body.enabled !== undefined) {
          db.prepare(`INSERT INTO learn_kids (member_id, enabled) VALUES (?, ?)
            ON CONFLICT (member_id) DO UPDATE SET enabled = excluded.enabled`).run(r.id, req.body.enabled ? 1 : 0);
        }
        for (const [game, level] of levels) setLevel(r.id, game, level);
      })();
      return state(kid(r.id)!, today);
    });

  // A finished game: rounds played and how many were right the first time. The last few plays at its
  // level all perfect moves it up.
  app.post<{ Params: { memberId: string }; Body: { today: string; game: Game; level: number; rounds: number; firstTry: number } }>(
    '/api/learn/:memberId/done', {
      schema: { body: { type: 'object', required: ['today', 'game', 'level', 'rounds', 'firstTry'], additionalProperties: false, properties: {
        today: { type: 'string', pattern: DAY }, game: { enum: Object.keys(GAMES) },
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
      const leveledUp = db.transaction(() => {
        db.prepare(`INSERT INTO learn_sessions (id, member_id, day, skill, level, rounds, first_try) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), r.id, today, game, level, rounds, firstTry);
        const at = levelOf(r.id, game);
        if (level !== at || at >= GAMES[game]) return false;
        // The plays at this level since it was set or moved up to, latest first.
        const plays = db.prepare(`SELECT s.first_try = s.rounds AS perfect FROM learn_sessions s
          LEFT JOIN learn_levels l ON l.member_id = s.member_id AND l.skill = s.skill
          WHERE s.member_id = ? AND s.skill = ? AND s.level = ? AND s.rowid > COALESCE(l.since_play, 0)
          ORDER BY s.rowid DESC`)
          .all(r.id, game, at) as { perfect: number }[];
        const perfectRun = plays.length >= PLAYS_TO_LEVEL_UP && plays.slice(0, PLAYS_TO_LEVEL_UP).every((p) => p.perfect);
        const playedEnough = PLAYS_TO_MOVE_ON[game] !== undefined && plays.length >= PLAYS_TO_MOVE_ON[game]!;
        if (!perfectRun && !playedEnough) return false;
        setLevel(r.id, game, at + 1);
        return true;
      })();
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
    if (!ANIMALS.includes(req.params.animal)) return reply.code(404).send({ error: 'No such animal' });
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
