import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { bucket } from './rewards.ts';

// Potty charts, a punch card for potty training. Each step of a trip has its own row: said I need to
// go, sat on the potty, went (pee, poop or both), wiped and flushed (with help), washed hands. Seven punches
// fill a row, and a full row is a star in the kid's bucket. When every row is full the card is done
// (a celebration) and a fresh one starts. Accidents aren't recorded: the card only goes forward.

export const STEPS = ['ask', 'sit', 'go', 'wipe', 'wash'] as const;
export type Step = (typeof STEPS)[number];
/** Punches to fill a row (and earn its star). */
export const ROW_PUNCHES = 7;
/** What the go row says it was. */
export const KINDS = ['pee', 'poo', 'both'] as const;
export type Kind = (typeof KINDS)[number];

interface CardRow { id: string; member_id: string; started_at: string; finished_at: string | null }
interface PunchRow { step: Step; kind: Kind | null }

/** The kid's card being filled, started if there isn't one. */
function currentCard(db: DB, memberId: string): CardRow {
  const card = db.prepare('SELECT * FROM potty_cards WHERE member_id = ? AND finished_at IS NULL').get(memberId) as CardRow | undefined;
  if (card) return card;
  const id = randomUUID();
  db.prepare('INSERT INTO potty_cards (id, member_id) VALUES (?, ?)').run(id, memberId);
  return db.prepare('SELECT * FROM potty_cards WHERE id = ?').get(id) as CardRow;
}

/** Each row's punches, oldest first: the kind for the go row, otherwise null. */
function rows(db: DB, cardId: string) {
  const punches = db.prepare('SELECT step, kind FROM potty_punches WHERE card_id = ? ORDER BY created_at, rowid').all(cardId) as PunchRow[];
  return Object.fromEntries(STEPS.map((s) => [s, punches.filter((p) => p.step === s).map((p) => p.kind)])) as Record<Step, (Kind | null)[]>;
}

function chart(db: DB, memberId: string) {
  const card = currentCard(db, memberId);
  const done = db.prepare('SELECT started_at, finished_at FROM potty_cards WHERE member_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC')
    .all(memberId) as { started_at: string; finished_at: string }[];
  return {
    memberId,
    card: { id: card.id, startedAt: card.started_at, rows: rows(db, card.id) },
    filled: done.map((c) => ({ startedAt: c.started_at, finishedAt: c.finished_at })),
  };
}

export function registerPotty(app: FastifyInstance, db: DB) {
  const isKid = (id: string) => !!db.prepare('SELECT 1 FROM potty_kids WHERE member_id = ?').get(id);

  // Every kid on a potty chart: their card and the cards they've filled, newest first.
  app.get('/api/potty', async () =>
    (db.prepare('SELECT member_id FROM potty_kids ORDER BY started_at').all() as { member_id: string }[])
      .map((k) => db.transaction(() => chart(db, k.member_id))()));

  // A parent starts or stops a kid's chart. Stopping keeps the card, to pick up again.
  app.put<{ Params: { memberId: string }; Body: { on: boolean } }>('/api/potty/:memberId', {
    schema: { body: { type: 'object', required: ['on'], additionalProperties: false, properties: { on: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const { memberId } = req.params;
    if (!db.prepare('SELECT 1 FROM members WHERE id = ?').get(memberId)) return reply.code(404).send({ error: 'Unknown member' });
    if (req.body.on) db.prepare('INSERT OR IGNORE INTO potty_kids (member_id) VALUES (?)').run(memberId);
    else db.prepare('DELETE FROM potty_kids WHERE member_id = ?').run(memberId);
    return reply.code(204).send();
  });

  // One step done: a punch in its row. Says whether that filled the row (a star) and the card.
  app.post<{ Params: { memberId: string }; Body: { step: Step; kind?: Kind } }>('/api/potty/:memberId', {
    schema: { body: { type: 'object', required: ['step'], additionalProperties: false,
      properties: { step: { enum: STEPS }, kind: { enum: KINDS } } } },
  }, async (req, reply) => {
    const { memberId } = req.params;
    const { step, kind } = req.body;
    if (!isKid(memberId)) return reply.code(404).send({ error: "They aren't on a potty chart" });
    if ((step === 'go') !== !!kind) return reply.code(400).send({ error: step === 'go' ? 'Pee, poop or both?' : 'Only the go row says pee or poop' });
    const result = db.transaction(() => {
      const card = currentCard(db, memberId);
      const before = rows(db, card.id);
      if (before[step].length >= ROW_PUNCHES) return null;
      db.prepare('INSERT INTO potty_punches (id, card_id, member_id, step, kind) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), card.id, memberId, step, kind ?? null);
      const rowFull = before[step].length + 1 === ROW_PUNCHES;
      const cardFull = rowFull && STEPS.every((s) => s === step || before[s].length >= ROW_PUNCHES);
      if (cardFull) {
        db.prepare("UPDATE potty_cards SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(card.id);
      }
      return { rowFull, cardFull, chart: chart(db, memberId) };
    })();
    return result ?? reply.code(409).send({ error: 'That row is full' });
  });

  // A parent takes back a row's last punch (tapped by mistake). Not once that row's star is in a jar.
  app.delete<{ Params: { memberId: string; step: string } }>('/api/potty/:memberId/:step', async (req, reply) => {
    const { memberId, step } = req.params;
    if (!STEPS.includes(step as Step)) return reply.code(400).send({ error: 'Unknown step' });
    const refused = db.transaction(() => {
      const card = db.prepare('SELECT * FROM potty_cards WHERE member_id = ? AND finished_at IS NULL').get(memberId) as CardRow | undefined;
      const last = card && db.prepare('SELECT id FROM potty_punches WHERE card_id = ? AND step = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
        .get(card.id, step) as { id: string } | undefined;
      if (!card || !last) return [404, 'Nothing to take back'] as const;
      if (rows(db, card.id)[step as Step].length >= ROW_PUNCHES && bucket(db, memberId) < 1) {
        return [409, "That row's star is already in a jar"] as const;
      }
      db.prepare('DELETE FROM potty_punches WHERE id = ?').run(last.id);
      return null;
    })();
    return refused ? reply.code(refused[0]).send({ error: refused[1] }) : reply.code(204).send();
  });
}
