import type { FastifyInstance } from 'fastify';
import { randomInt, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AccountsDB, InviteRow, MembershipRow, SessionRow } from '../accounts.ts';
import { hashPin, sha } from '../auth.ts';
import { ALPHABET, INVITE_MS, NAME, PIN, later, limiter, normalizeCode, now, showCode, type Sessions } from './session.ts';

// A household: starting one, switching between yours, inviting people (and walls) with a code and
// joining with one, who's in it for Settings, taking someone out, and a guardian's PIN.

export function householdRoutes(app: FastifyInstance, accounts: AccountsDB, x: Sessions) {
  const { sessionOf, householdById, contextOf, startSession, addMember, membersOf, status, needUser, needParent } = x;

  app.post<{ Body: { name: string; yourName: string; color?: string } }>('/api/account/households', {
    schema: { body: { type: 'object', required: ['name', 'yourName'], additionalProperties: false,
      properties: { name: NAME, yourName: NAME, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } } } },
  }, async (req, reply) => {
    const s = needUser(req, reply);
    if (!s) return;
    const id = randomUUID();
    // Relative to the data folder (accounts.ts toStored).
    const dir = join('households', id);
    accounts.prepare('INSERT INTO households (id, name, db_file, photos_dir) VALUES (?, ?, ?, ?)')
      .run(id, req.body.name.trim(), join(dir, 'calendar.db'), join(dir, 'photos'));
    const h = householdById(id)!;
    const memberId = await addMember(h, req.body.yourName, req.body.color?.toLowerCase());
    accounts.transaction(() => {
      accounts.prepare(`INSERT INTO memberships (id, household_id, member_id, user_id, role) VALUES (?, ?, ?, ?, 'guardian')`)
        .run(randomUUID(), id, memberId, s.user_id);
      accounts.prepare('UPDATE sessions SET household_id = ? WHERE token_hash = ?').run(id, s.token_hash);
    })();
    reply.code(201);
    return status(req);
  });

  // Switches this device to another of the user's households.
  app.post<{ Params: { id: string } }>('/api/account/households/:id/use', async (req, reply) => {
    const s = needUser(req, reply);
    if (!s) return;
    if (!accounts.prepare('SELECT 1 FROM memberships WHERE household_id = ? AND user_id = ?').get(req.params.id, s.user_id)) {
      return reply.code(404).send({ error: 'Household not found' });
    }
    accounts.prepare('UPDATE sessions SET household_id = ?, parent_until = NULL WHERE token_hash = ?').run(req.params.id, s.token_hash);
    return status(req);
  });

  // ---- Invites and joining ------------------------------------------------------

  const joinTries = limiter();
  const inviteFor = (code: string) => {
    const row = accounts.prepare('SELECT * FROM invites WHERE code_hash = ?').get(sha(normalizeCode(code))) as InviteRow | undefined;
    return row && row.expires_at > now() ? row : undefined;
  };
  const claimed = (householdId: string) => new Set((accounts.prepare('SELECT member_id FROM memberships WHERE household_id = ?')
    .all(householdId) as { member_id: string }[]).map((m) => m.member_id));

  // What a code is for, before using it: to show "Join the Kim household as Sam".
  app.get<{ Params: { code: string } }>('/api/account/join/:code', async (req, reply) => {
    const blocked = joinTries.blocked(req.ip);
    if (blocked) return reply.code(429).send({ error: blocked });
    const inv = inviteFor(req.params.code);
    if (!inv) {
      joinTries.wrong(req.ip);
      return reply.code(404).send({ error: "That code isn't right, or it has expired" });
    }
    const h = householdById(inv.household_id)!;
    const members = await membersOf(h);
    const taken = claimed(h.id);
    return {
      kind: inv.kind, household: h.name,
      for: inv.member_id ? members.find((m) => m.id === inv.member_id)?.name ?? null : inv.new_name,
      // No one named: whoever joins picks who they are (or adds themselves).
      choose: inv.kind !== 'wall' && !inv.member_id && !inv.new_name ? members.filter((m) => !taken.has(m.id)).map(({ id, name }) => ({ id, name })) : null,
    };
  });

  app.post<{ Body: { code: string; memberId?: string; name?: string } }>('/api/account/join', {
    schema: { body: { type: 'object', required: ['code'], additionalProperties: false,
      properties: { code: { type: 'string', maxLength: 20 }, memberId: { type: 'string' }, name: NAME } } },
  }, async (req, reply) => {
    const blocked = joinTries.blocked(req.ip);
    if (blocked) return reply.code(429).send({ error: blocked });
    const inv = inviteFor(req.body.code);
    if (!inv) {
      joinTries.wrong(req.ip);
      return reply.code(404).send({ error: "That code isn't right, or it has expired" });
    }
    joinTries.clear(req.ip);
    const h = householdById(inv.household_id)!;
    const useUp = () => accounts.prepare('DELETE FROM invites WHERE code_hash = ?').run(inv.code_hash);

    if (inv.kind === 'wall') {
      useUp();
      startSession(req, reply, { kind: 'wall', household_id: h.id, entered: 0 });
      return status(req);
    }

    const s = sessionOf(req);
    const user = s?.kind === 'user' ? s : null;
    if (inv.kind === 'guardian' && !user) return reply.code(401).send({ error: 'Sign in first, then use the code' });
    if (user && accounts.prepare('SELECT 1 FROM memberships WHERE household_id = ? AND user_id = ?').get(h.id, user.user_id)) {
      return reply.code(409).send({ error: `You're already in ${h.name}` });
    }

    // Which person: named in the invite, or picked (or added) by whoever joins.
    let memberId = inv.member_id;
    if (!memberId) {
      if (inv.new_name || req.body.name) memberId = await addMember(h, (inv.new_name ?? req.body.name)!);
      else if (req.body.memberId && (await membersOf(h)).some((m) => m.id === req.body.memberId) && !claimed(h.id).has(req.body.memberId)) memberId = req.body.memberId;
      else return reply.code(400).send({ error: 'Pick who you are' });
    }
    const existing = accounts.prepare('SELECT * FROM memberships WHERE household_id = ? AND member_id = ?').get(h.id, memberId) as MembershipRow | undefined;
    if (existing?.user_id && user) return reply.code(409).send({ error: 'Someone has already signed in as that person' });

    const membershipId = existing?.id ?? randomUUID();
    accounts.transaction(() => {
      if (existing) {
        accounts.prepare('UPDATE memberships SET role = ?, user_id = COALESCE(?, user_id) WHERE id = ?').run(inv.kind, user?.user_id ?? null, existing.id);
      } else {
        accounts.prepare('INSERT INTO memberships (id, household_id, member_id, user_id, role) VALUES (?, ?, ?, ?, ?)')
          .run(membershipId, h.id, memberId, user?.user_id ?? null, inv.kind);
      }
      useUp();
      if (user) accounts.prepare('UPDATE sessions SET household_id = ?, parent_until = NULL WHERE token_hash = ?').run(h.id, user.token_hash);
    })();
    // A kid without an account: this device signs in as them.
    if (!user) startSession(req, reply, { kind: 'device', household_id: h.id, membership_id: membershipId });
    return status(req);
  });

  app.post<{ Body: { kind: 'guardian' | 'kid' | 'wall'; memberId?: string; name?: string } }>('/api/account/invites', {
    schema: { body: { type: 'object', required: ['kind'], additionalProperties: false,
      properties: { kind: { type: 'string', enum: ['guardian', 'kid', 'wall'] }, memberId: { type: 'string' }, name: NAME } } },
  }, async (req, reply) => {
    const c = needParent(req, reply);
    if (!c) return;
    const { kind, memberId, name } = req.body;
    if (kind === 'wall' && !(accounts.prepare(`SELECT 1 FROM memberships WHERE household_id = ? AND role = 'guardian' AND pin_hash IS NOT NULL`).get(c.household.id))) {
      return reply.code(400).send({ error: 'Set your guardian PIN first: the wall asks for it' });
    }
    if (kind !== 'wall') {
      if (memberId && !(await membersOf(c.household)).some((m) => m.id === memberId)) return reply.code(400).send({ error: 'Unknown person' });
      if (!memberId && !name) return reply.code(400).send({ error: 'Who is it for?' });
      const taken = memberId && accounts.prepare('SELECT user_id FROM memberships WHERE household_id = ? AND member_id = ?').get(c.household.id, memberId) as { user_id: string | null } | undefined;
      if (taken && taken.user_id && kind === 'guardian') return reply.code(400).send({ error: 'They already sign in' });
    }
    const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const expiresAt = later(INVITE_MS[kind]);
    accounts.prepare('INSERT INTO invites (code_hash, household_id, kind, member_id, new_name, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sha(code), c.household.id, kind, kind === 'wall' ? null : memberId ?? null, kind === 'wall' || memberId ? null : name!.trim(), expiresAt);
    reply.code(201);
    return { code: showCode(code), expiresAt };
  });

  app.delete<{ Params: { id: string } }>('/api/account/invites/:id', async (req, reply) => {
    const c = needParent(req, reply);
    if (!c) return;
    const res = accounts.prepare('DELETE FROM invites WHERE substr(code_hash, 1, 16) = ? AND household_id = ?').run(req.params.id, c.household.id);
    return res.changes ? reply.code(204).send() : reply.code(404).send({ error: 'Invite not found' });
  });

  // Who's in the household and how they sign in, open invites, and signed-in devices: for Settings.
  app.get('/api/account/household', async (req, reply) => {
    const c = needParent(req, reply);
    if (!c) return;
    const h = c.household;
    const members = await membersOf(h);
    const ms = accounts.prepare(`SELECT m.*, u.email, u.name AS user_name FROM memberships m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.household_id = ?`).all(h.id) as (MembershipRow & { email: string | null; user_name: string | null })[];
    const nameOf = (memberId: string | null) => members.find((m) => m.id === memberId)?.name ?? null;
    const sessions = accounts.prepare(`SELECT s.*, m.member_id FROM sessions s
      LEFT JOIN memberships m ON m.id = s.membership_id OR (s.kind = 'user' AND m.household_id = s.household_id AND m.user_id = s.user_id)
      WHERE s.household_id = ? ORDER BY s.last_seen DESC`).all(h.id) as (SessionRow & { member_id: string | null })[];
    const invites = accounts.prepare('SELECT * FROM invites WHERE household_id = ? AND expires_at > ? ORDER BY created_at').all(h.id, now()) as InviteRow[];
    return {
      name: h.name,
      people: members.map((m) => {
        const ship = ms.find((x) => x.member_id === m.id);
        return {
          memberId: m.id, name: m.name, color: m.color,
          membershipId: ship?.id ?? null, role: ship?.role ?? null,
          // How they sign in: their own account (email shown), or devices added by code.
          email: ship?.email ?? null, account: !!ship?.user_id, hasPin: !!ship?.pin_hash,
        };
      }),
      invites: invites.map((i) => ({ id: i.code_hash.slice(0, 16), kind: i.kind, for: nameOf(i.member_id) ?? i.new_name, expiresAt: i.expires_at })),
      devices: sessions.map((d) => ({
        id: d.token_hash.slice(0, 16), label: d.label, kind: d.kind, who: d.kind === 'wall' ? 'Wall' : nameOf(d.member_id),
        signedInAt: d.created_at, lastSeen: d.last_seen, thisDevice: d.token_hash === c.s.token_hash,
      })),
    };
  });

  // Takes someone's sign-in out of the household (their devices too); they stay in the family list.
  app.delete<{ Params: { id: string } }>('/api/account/memberships/:id', async (req, reply) => {
    const c = needParent(req, reply);
    if (!c) return;
    const m = accounts.prepare('SELECT * FROM memberships WHERE id = ? AND household_id = ?').get(req.params.id, c.household.id) as MembershipRow | undefined;
    if (!m) return reply.code(404).send({ error: 'Not found' });
    const guardians = (accounts.prepare(`SELECT COUNT(*) n FROM memberships WHERE household_id = ? AND role = 'guardian'`).get(c.household.id) as { n: number }).n;
    if (m.role === 'guardian' && guardians === 1) return reply.code(400).send({ error: 'A household needs at least one guardian' });
    accounts.transaction(() => {
      if (m.user_id) accounts.prepare(`UPDATE sessions SET household_id = NULL, parent_until = NULL WHERE kind = 'user' AND user_id = ? AND household_id = ?`).run(m.user_id, c.household.id);
      accounts.prepare('DELETE FROM memberships WHERE id = ?').run(m.id);
    })();
    return reply.code(204).send();
  });

  // A guardian's PIN, for entering the wall and unlocking it (or a kid's device) for changes.
  app.put<{ Body: { pin: string } }>('/api/account/pin', {
    schema: { body: { type: 'object', required: ['pin'], additionalProperties: false, properties: { pin: PIN } } },
  }, async (req, reply) => {
    const s = needUser(req, reply);
    if (!s) return;
    const c = contextOf(s);
    if (c.role !== 'guardian' || !c.membership) return reply.code(403).send({ error: 'Only guardians have a PIN' });
    accounts.prepare('UPDATE memberships SET pin_hash = ?, pin_length = ? WHERE id = ?').run(hashPin(req.body.pin), req.body.pin.length, c.membership.id);
    return status(req);
  });
}
