import type { FastifyInstance } from 'fastify';
import type { AccountsDB, SessionRow } from '../accounts.ts';
import { pinMatches } from '../auth.ts';
import { PARENT_MS, later, type Sessions } from './session.ts';

// The wall and the parent unlock: entering the wall with a guardian's PIN, unlocking a wall or kid's
// device for changes (and locking it again), checking a PIN to leave kid mode, and signing a device out.

export function unlockRoutes(app: FastifyInstance, accounts: AccountsDB, x: Sessions) {
  const { sessionOf, contextOf, ownParent, isParent, setParentUntil, status, needParent, pinTries } = x;

  /** Checks a PIN against every guardian's in the household: whose it is, or what's wrong. */
  function checkPin(s: SessionRow, pin: string): { by: string } | { error: string } {
    const blocked = pinTries.blocked(s.token_hash);
    if (blocked) return { error: blocked };
    const pins = accounts.prepare(`SELECT id, pin_hash, pin_length FROM memberships WHERE household_id = ? AND role = 'guardian' AND pin_hash IS NOT NULL`)
      .all(s.household_id) as { id: string; pin_hash: string; pin_length: number | null }[];
    const match = pins.find((p) => pinMatches(pin, p.pin_hash));
    if (match) {
      pinTries.clear(s.token_hash);
      // A PIN set before lengths were kept: learn it now, so the number pad can check it as it's typed.
      if (match.pin_length === null) accounts.prepare('UPDATE memberships SET pin_length = ? WHERE id = ?').run(pin.length, match.id);
      return { by: match.id };
    }
    return { error: pinTries.wrong(s.token_hash) ? 'Too many wrong tries. Try again in 15 min.' : 'Wrong PIN' };
  }
  const pinBody = { schema: { body: { type: 'object', required: ['pin'], additionalProperties: false, properties: { pin: { type: 'string', maxLength: 12 } } } } };

  // The wall: enter with any guardian's PIN. It starts unlocked for changes, too.
  app.post<{ Body: { pin: string } }>('/api/auth/enter', pinBody, async (req, reply) => {
    const s = sessionOf(req);
    if (s?.kind !== 'wall' || !contextOf(s).household) return reply.code(401).send({ error: 'Add this wall with a code first' });
    const pin = checkPin(s, req.body.pin);
    if ('error' in pin) return reply.code(403).send(pin);
    accounts.prepare('UPDATE sessions SET entered = 1, parent_until = ?, parent_by = ? WHERE token_hash = ?').run(later(PARENT_MS), pin.by, s.token_hash);
    return status(req);
  });

  // Unlocks this wall or kid's device for parent changes with any guardian's PIN, for 10 minutes (more with each change).
  app.post<{ Body: { pin: string } }>('/api/auth/parent', pinBody, async (req, reply) => {
    const s = sessionOf(req);
    const c = s && contextOf(s);
    if (!s || !c?.household) return reply.code(401).send({ error: 'Sign in first' });
    if (ownParent(c)) return status(req);
    const pin = checkPin(s, req.body.pin);
    if ('error' in pin) return reply.code(403).send(pin);
    setParentUntil(s, later(PARENT_MS), pin.by);
    return status(req);
  });

  // Kid mode: leaving it takes a guardian's PIN, even on a guardian's own phone. Checks it and changes nothing.
  app.post<{ Body: { pin: string } }>('/api/auth/check-pin', pinBody, async (req, reply) => {
    const s = sessionOf(req);
    if (!s || !contextOf(s).household) return reply.code(401).send({ error: 'Sign in first' });
    const pin = checkPin(s, req.body.pin);
    if ('error' in pin) return reply.code(403).send(pin);
    return reply.code(204).send();
  });

  // Wall mode: a guardian turns their own device into the wall; turning it back takes a guardian's PIN
  // (this device unlocked with one), so a kid can't get back to the grown-up's account.
  app.post<{ Body: { on: boolean } }>('/api/auth/wall-mode', {
    schema: { body: { type: 'object', required: ['on'], additionalProperties: false, properties: { on: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const s = sessionOf(req);
    const c = s && contextOf(s);
    if (s?.kind !== 'user' || !c?.household) return reply.code(401).send({ error: 'Sign in first' });
    if (req.body.on) {
      if (!ownParent(c)) return reply.code(403).send({ error: 'Only a guardian turns on wall mode' });
      accounts.prepare('UPDATE sessions SET wall_mode = 1, parent_until = NULL, parent_by = NULL WHERE token_hash = ?').run(s.token_hash);
    } else {
      if (c.role !== 'wall') return status(req);
      if (!isParent(c)) return reply.code(403).send({ error: "Unlock with a guardian's PIN first", locked: true });
      accounts.prepare('UPDATE sessions SET wall_mode = 0, parent_until = NULL, parent_by = NULL WHERE token_hash = ?').run(s.token_hash);
    }
    return status(req);
  });

  app.post('/api/auth/parent/lock', async (req) => {
    const s = sessionOf(req);
    if (s) setParentUntil(s, null);
    return status(req);
  });

  // Locks the wall: back to the PIN screen.
  app.post('/api/auth/lock-wall', async (req, reply) => {
    const s = sessionOf(req);
    if (s?.kind !== 'wall') return reply.code(400).send({ error: 'Only the wall locks this way' });
    accounts.prepare('UPDATE sessions SET entered = 0, parent_until = NULL, parent_by = NULL WHERE token_hash = ?').run(s.token_hash);
    return status(req);
  });

  app.post<{ Params: { id: string } }>('/api/auth/devices/:id/sign-out', async (req, reply) => {
    const c = needParent(req, reply);
    if (!c) return;
    const res = accounts.prepare('DELETE FROM sessions WHERE substr(token_hash, 1, 16) = ? AND household_id = ?').run(req.params.id, c.household.id);
    return res.changes ? reply.code(204).send() : reply.code(404).send({ error: 'Device not found' });
  });
}
