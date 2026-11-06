import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { toStored, type AccountsDB, type HouseholdRow, type InviteRow, type MembershipRow, type SessionRow } from './accounts.ts';
import type { HouseholdRegistry } from './households.ts';
import type { Identity, SendCode, VerifyToken } from './identity.ts';
import type { GoogleOAuth } from './providers/google.ts';
import { deviceLabel, hashPin, pinMatches, sha } from './auth.ts';

// The front of the hosted app. It signs people in (Apple, Google, or a code by email), keeps track
// of households, invites and devices (accounts.ts), and passes every other /api call to the
// household the caller is signed in to, with who they are (auth.ts Viewer).
//
// Ways in:
// - Guardians and older kids sign in with their own account, then create a household or join one
//   with an invite code. A guardian on their own phone can change anything.
// - A younger kid's device joins with a kid code (no account).
// - The wall joins with a wall code, then needs a guardian's PIN to enter.
// A wall or kid's device can be unlocked for parent changes with any guardian's PIN, for 10 minutes
// (each change starts it over).

const COOKIE = 'household_session';
const YEAR_S = 365 * 24 * 3600;
const PARENT_MS = 10 * 60_000;
const MAX_TRIES = 5;
const LOCK_MS = 15 * 60_000;
const CODE_MS = 10 * 60_000;
const INVITE_MS = { guardian: 7 * 86_400_000, kid: 7 * 86_400_000, wall: 15 * 60_000 } as const;
const COLORS = ['#2f7de1', '#e0457b', '#f29d38', '#3fae6a', '#8e5bd6', '#14a3a8', '#d4513b', '#6b7a8f'];
/** Invite codes: no 0/O or 1/I, so they're easy to read out and type. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const now = () => new Date().toISOString();
const later = (ms: number) => new Date(Date.now() + ms).toISOString();
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const showCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
const PIN = { type: 'string', pattern: '^[0-9]{4,8}$' } as const;
const NAME = { type: 'string', minLength: 1, maxLength: 40 } as const;

export interface ServerOptions {
  /** Where new households' databases and photos go (data/households/<id>/). */
  dataDir: string;
  webDist?: string;
  /** Sign in with Google: the web page's client id, and the check for its tokens. */
  google?: { clientId: string; verify: VerifyToken };
  /** Sign in with Apple: the web Services ID, and the check for its tokens. */
  apple?: { clientId: string; verify: VerifyToken };
  /** Emails sign-in codes; without it, email sign-in is off. */
  sendCode?: SendCode;
  /** Connecting each person's Google Calendar; without it, that's off. */
  googleCalendar?: GoogleOAuth;
  /** The app's address as people reach it (https://…), for Google to come back to; else from each request. */
  publicUrl?: string;
  /**
   * Which proxies' X-Forwarded-For to believe (for each device's address, which limits wrong codes):
   * the host's load balancer when hosted (true), else only tailscale serve on this machine.
   */
  trustProxy?: boolean | string;
  logger?: boolean;
}

function tokenOf(req: IncomingMessage) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie ?? '');
  if (m) return m[1];
  // The phone app (later) sends its token as a header instead of a cookie.
  const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
  return bearer?.[1] ?? null;
}

function sendJson(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Tries per key (an address, or a device for PINs); five wrong ones lock it for 15 minutes. */
function limiter() {
  const tries = new Map<string, { n: number; until: number }>();
  return {
    blocked(key: string) {
      const t = tries.get(key);
      return t && t.until > Date.now() ? `Too many wrong tries. Try again in ${Math.ceil((t.until - Date.now()) / 60_000)} min.` : null;
    },
    wrong(key: string) {
      const t = tries.get(key);
      const n = (t && t.until === 0 ? t.n : 0) + 1;
      tries.set(key, n >= MAX_TRIES ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 });
      return n >= MAX_TRIES;
    },
    clear: (key: string) => void tries.delete(key),
  };
}

export function buildServer(accounts: AccountsDB, households: HouseholdRegistry, opts: ServerOptions) {
  let rootHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
  const app = Fastify({
    logger: opts.logger ?? (process.env.NODE_ENV !== 'test' && { level: 'info' }),
    trustProxy: opts.trustProxy ?? 'loopback',
    serverFactory: (handler) => {
      rootHandler = handler;
      return createServer((req, res) => {
        handle(req, res).catch((err) => {
          app.log.error(err);
          if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong' });
        });
      });
    },
  });

  // ---- Sessions ----------------------------------------------------------

  /** Sessions started during a request, which its reply then reports on (its cookie is still the old one). */
  const started = new WeakMap<IncomingMessage, string>();
  const sessionOf = (req: IncomingMessage | FastifyRequest) => {
    const raw = 'raw' in req ? req.raw : req;
    const token = tokenOf(raw);
    const hash = started.get(raw) ?? (token ? sha(token) : null);
    return hash ? accounts.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hash) as SessionRow | undefined : undefined;
  };
  const householdById = (id: string | null) =>
    id ? accounts.prepare('SELECT * FROM households WHERE id = ?').get(id) as HouseholdRow | undefined : undefined;

  /** Who a session is in its household: role and membership, or nothing if it isn't in one (any more). */
  function contextOf(s: SessionRow) {
    const household = householdById(s.household_id) ?? null;
    let membership: MembershipRow | null = null;
    if (household && s.kind === 'user') {
      membership = accounts.prepare('SELECT * FROM memberships WHERE household_id = ? AND user_id = ?').get(household.id, s.user_id) as MembershipRow ?? null;
    } else if (household && s.kind === 'device') {
      membership = accounts.prepare('SELECT * FROM memberships WHERE id = ? AND household_id = ?').get(s.membership_id, household.id) as MembershipRow ?? null;
    }
    const role = s.kind === 'wall' ? (household ? 'wall' as const : null) : membership?.role ?? null;
    return { s, household: role ? household : null, membership, role };
  }
  type Ctx = ReturnType<typeof contextOf>;
  /** A guardian on their own account, or a device unlocked with a guardian's PIN. */
  const ownParent = (c: Ctx) => c.role === 'guardian' && c.s.kind === 'user';
  const isParent = (c: Ctx) => ownParent(c) || (!!c.s.parent_until && c.s.parent_until > now());
  /** Unlocks (by a guardian's membership) until then, or locks (null). */
  const setParentUntil = (s: SessionRow, until: string | null, by?: string) =>
    accounts.prepare('UPDATE sessions SET parent_until = ?, parent_by = COALESCE(?, parent_by) WHERE token_hash = ?')
      .run(until, until ? by ?? null : null, s.token_hash);

  function startSession(req: FastifyRequest, reply: FastifyReply, row: Pick<SessionRow, 'kind'> & Partial<SessionRow>) {
    // Devices unused for longer than a cookie lasts are signed out for good.
    accounts.prepare(`DELETE FROM sessions WHERE last_seen < ?`).run(new Date(Date.now() - YEAR_S * 1000).toISOString());
    const old = sessionOf(req);
    if (old) accounts.prepare('DELETE FROM sessions WHERE token_hash = ?').run(old.token_hash);
    const token = randomBytes(32).toString('base64url');
    accounts.prepare(`INSERT INTO sessions (token_hash, kind, user_id, household_id, membership_id, label, entered)
      VALUES (@token_hash, @kind, @user_id, @household_id, @membership_id, @label, @entered)`).run({
      token_hash: sha(token), kind: row.kind, user_id: row.user_id ?? null, household_id: row.household_id ?? null,
      membership_id: row.membership_id ?? null, label: deviceLabel(req.headers['user-agent']), entered: row.entered ?? 1,
    });
    started.set(req.raw, sha(token));
    const secure = req.protocol === 'https';
    reply.header('set-cookie', `${COOKIE}=${token}; Path=/; Max-Age=${YEAR_S}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
    return token;
  }

  // ---- Passing calls to households ----------------------------------------

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url ?? '/').split('?')[0];
    // The phones' Reminders Shortcut has its own token, for the household from before accounts.
    if (path.startsWith('/api/reminders/phone/')) {
      const legacy = accounts.prepare('SELECT * FROM households WHERE legacy = 1').get() as HouseholdRow | undefined;
      if (!legacy) return sendJson(res, 404, { error: 'Not found' });
      return (await households.get(legacy)).app.routing(req, res);
    }
    if (path.startsWith('/api/') && !/^\/api\/(account|auth)\//.test(path)) {
      const s = sessionOf(req);
      const c = s && contextOf(s);
      if (!s || !c?.household || !c.role) return sendJson(res, 401, { error: 'Sign in first' });
      if (s.kind === 'wall' && !s.entered) return sendJson(res, 401, { error: "Sign in with a guardian's PIN" });
      accounts.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ? AND last_seen < ?')
        .run(now(), s.token_hash, new Date(Date.now() - 60_000).toISOString());
      req.viewer = {
        role: c.role, memberId: c.membership?.member_id ?? null, parent: isParent(c),
        stillParent: () => { if (!ownParent(c)) setParentUntil(s, later(PARENT_MS)); },
      };
      return (await households.get(c.household)).app.routing(req, res);
    }
    rootHandler!(req, res);
  }

  /** The person's record in a household's own database. */
  async function addMember(h: HouseholdRow, name: string, color?: string) {
    const { db } = await households.get(h);
    const n = (db.prepare('SELECT COUNT(*) n FROM members').get() as { n: number }).n;
    const id = randomUUID();
    db.prepare('INSERT INTO members (id, name, color, sort_order) VALUES (?, ?, ?, ?)').run(id, name.trim(), color ?? COLORS[n % COLORS.length], n);
    return id;
  }
  async function membersOf(h: HouseholdRow) {
    const { db } = await households.get(h);
    return db.prepare('SELECT id, name, color FROM members ORDER BY sort_order, created_at').all() as { id: string; name: string; color: string }[];
  }

  // ---- Signing in ----------------------------------------------------------

  /** The user for an identity: the same one as last time, or one with the same verified email, or new. */
  function userFor(provider: 'google' | 'apple' | 'email', id: Identity) {
    const known = accounts.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').get(provider, id.subject) as { user_id: string } | undefined;
    if (known) return known.user_id;
    return accounts.transaction(() => {
      let userId = id.email
        ? (accounts.prepare('SELECT id FROM users WHERE email = ?').get(id.email) as { id: string } | undefined)?.id
        : undefined;
      if (!userId) {
        userId = randomUUID();
        accounts.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)')
          .run(userId, id.name?.trim() || id.email?.split('@')[0] || 'New user', id.email);
      }
      accounts.prepare('INSERT INTO identities (provider, subject, user_id, email) VALUES (?, ?, ?, ?)').run(provider, id.subject, userId, id.email);
      return userId;
    })();
  }

  /** Signs this device in as the user, in their most recent household (if any). */
  function signInUser(req: FastifyRequest, reply: FastifyReply, userId: string) {
    const h = accounts.prepare('SELECT household_id FROM memberships WHERE user_id = ? ORDER BY created_at DESC').get(userId) as { household_id: string } | undefined;
    startSession(req, reply, { kind: 'user', user_id: userId, household_id: h?.household_id ?? null });
    return status(req);
  }

  app.get('/api/account/config', async () => ({
    google: opts.google?.clientId ?? null, apple: opts.apple?.clientId ?? null, email: !!opts.sendCode,
  }));

  app.post<{ Params: { provider: 'google' | 'apple' }; Body: { idToken: string; name?: string } }>('/api/account/signin/:provider', {
    schema: {
      params: { type: 'object', properties: { provider: { type: 'string', enum: ['google', 'apple'] } } },
      body: { type: 'object', required: ['idToken'], additionalProperties: false,
        properties: { idToken: { type: 'string', minLength: 10, maxLength: 8192 }, name: { type: 'string', maxLength: 80 } } },
    },
  }, async (req, reply) => {
    const provider = opts[req.params.provider];
    if (!provider) return reply.code(400).send({ error: 'That way of signing in is off' });
    let id: Identity;
    try {
      id = await provider.verify(req.body.idToken);
    } catch (err) {
      req.log.warn({ err }, 'sign-in token refused');
      return reply.code(401).send({ error: 'That sign-in didn’t work. Try again.' });
    }
    // Apple sends the name to the page only on the first sign-in.
    if (!id.name && req.body.name) id = { ...id, name: req.body.name };
    return signInUser(req, reply, userFor(req.params.provider, id));
  });

  app.post<{ Body: { email: string } }>('/api/account/email/start', {
    schema: { body: { type: 'object', required: ['email'], additionalProperties: false,
      properties: { email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', maxLength: 200 } } } },
  }, async (req, reply) => {
    if (!opts.sendCode) return reply.code(400).send({ error: 'Email sign-in is off' });
    const email = req.body.email.trim().toLowerCase();
    const last = accounts.prepare('SELECT sent_at FROM email_codes WHERE email = ?').get(email) as { sent_at: string } | undefined;
    if (last && last.sent_at > new Date(Date.now() - 30_000).toISOString()) {
      return reply.code(429).send({ error: 'A code was just sent. Wait a moment before asking for another.' });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    accounts.prepare(`INSERT INTO email_codes (email, code_hash, sent_at, expires_at, tries) VALUES (?, ?, ?, ?, 0)
      ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, sent_at = excluded.sent_at, expires_at = excluded.expires_at, tries = 0`)
      .run(email, hashPin(code), now(), later(CODE_MS));
    await opts.sendCode(email, code);
    return { sent: true };
  });

  app.post<{ Body: { email: string; code: string } }>('/api/account/email/verify', {
    schema: { body: { type: 'object', required: ['email', 'code'], additionalProperties: false,
      properties: { email: { type: 'string', maxLength: 200 }, code: { type: 'string', maxLength: 12 } } } },
  }, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase();
    const row = accounts.prepare('SELECT * FROM email_codes WHERE email = ?').get(email) as
      { code_hash: string; expires_at: string; tries: number } | undefined;
    if (!row || row.expires_at < now() || row.tries >= MAX_TRIES) return reply.code(401).send({ error: 'That code has expired. Ask for a new one.' });
    if (!pinMatches(req.body.code.replace(/\D/g, ''), row.code_hash)) {
      accounts.prepare('UPDATE email_codes SET tries = tries + 1 WHERE email = ?').run(email);
      return reply.code(401).send({ error: 'Wrong code' });
    }
    accounts.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
    return signInUser(req, reply, userFor('email', { subject: email, email, name: null }));
  });

  app.post('/api/account/signout', async (req, reply) => {
    const s = sessionOf(req);
    if (s) accounts.prepare('DELETE FROM sessions WHERE token_hash = ?').run(s.token_hash);
    started.delete(req.raw);
    reply.header('set-cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    return reply.code(204).send();
  });

  // ---- Status ----------------------------------------------------------------

  async function status(req: FastifyRequest) {
    const s = sessionOf(req);
    if (!s) return { signedIn: false as const };
    const c = contextOf(s);
    // A kid's device or wall taken out of its household is signed out.
    if (s.kind !== 'user' && !c.household) {
      accounts.prepare('DELETE FROM sessions WHERE token_hash = ?').run(s.token_hash);
      return { signedIn: false as const };
    }
    const user = s.user_id ? accounts.prepare('SELECT name, email FROM users WHERE id = ?').get(s.user_id) as { name: string; email: string | null } : null;
    const theirs = s.user_id ? accounts.prepare(`SELECT h.id, h.name, m.role FROM memberships m JOIN households h ON h.id = m.household_id
      WHERE m.user_id = ? ORDER BY h.name`).all(s.user_id) as { id: string; name: string; role: string }[] : [];
    const pinLengths = c.household ? (accounts.prepare(`SELECT pin_length FROM memberships
      WHERE household_id = ? AND role = 'guardian' AND pin_hash IS NOT NULL`).all(c.household.id) as { pin_length: number | null }[])
      .map((r) => r.pin_length) : [];
    const guardianPins = pinLengths.length;
    // Who this device is, as the app shows them, and whose PIN has it unlocked.
    const people = c.household ? await membersOf(c.household) : [];
    const person = people.find((m) => m.id === c.membership?.member_id);
    const unlocker = isParent(c) && !ownParent(c) && s.parent_by
      ? accounts.prepare('SELECT member_id FROM memberships WHERE id = ?').get(s.parent_by) as { member_id: string } | undefined
      : undefined;
    return {
      signedIn: true as const,
      kind: s.kind,
      user,
      household: c.household && { id: c.household.id, name: c.household.name },
      households: theirs,
      role: c.role,
      memberId: c.membership?.member_id ?? null,
      me: person ? { name: person.name, color: person.color } : null,
      /** The guardian whose PIN unlocked this wall or kid's device. */
      unlockedBy: people.find((m) => m.id === unlocker?.member_id)?.name ?? null,
      /** The wall: a guardian's PIN has been typed. */
      entered: s.kind !== 'wall' || s.entered === 1,
      parent: isParent(c),
      /** A guardian's own device: never locked. */
      parentAlways: ownParent(c),
      hasPin: !!c.membership?.pin_hash,
      guardianPins,
      /** How long every guardian's PIN is, when they're all the same (and known): the pad checks it at that length. */
      pinLength: pinLengths.length && pinLengths.every((n) => n !== null && n === pinLengths[0]) ? pinLengths[0] : null,
    };
  }
  app.get('/api/auth/status', async (req) => status(req));

  // ---- Households ------------------------------------------------------------

  /** The signed-in user's session, or a 401. */
  const needUser = (req: FastifyRequest, reply: FastifyReply) => {
    const s = sessionOf(req);
    if (s?.kind === 'user') return s;
    reply.code(401).send({ error: 'Sign in first' });
    return null;
  };
  /** The household of a session that may manage it (a guardian, or a device unlocked with a guardian's PIN). */
  const needParent = (req: FastifyRequest, reply: FastifyReply) => {
    const s = sessionOf(req);
    const c = s && contextOf(s);
    if (!c?.household) {
      reply.code(401).send({ error: 'Sign in first' });
      return null;
    }
    if (!isParent(c) || (s!.kind === 'wall' && !s!.entered)) {
      reply.code(403).send({ error: "Locked: unlock with a guardian's PIN to change this", locked: true });
      return null;
    }
    return c as Ctx & { household: HouseholdRow };
  };

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

  // ---- The wall and the parent unlock --------------------------------------------

  const pinTries = limiter();
  /** Checks a PIN against every guardian's in the household: whose it is, or what's wrong. */
  function checkPin(s: SessionRow, pin: string): { by: string } | { error: string } {
    const blocked = pinTries.blocked(s.token_hash);
    if (blocked) return { error: blocked };
    const pins = accounts.prepare(`SELECT id, pin_hash FROM memberships WHERE household_id = ? AND role = 'guardian' AND pin_hash IS NOT NULL`)
      .all(s.household_id) as { id: string; pin_hash: string }[];
    const match = pins.find((p) => pinMatches(pin, p.pin_hash));
    if (match) {
      pinTries.clear(s.token_hash);
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

  // ---- Connecting Google Calendar -------------------------------------------------
  // The page links here; Google asks the person to allow access, then comes back to the callback,
  // which hands the account to their household to sync. Back on the app, Settings shows it.

  const googleStates = new Map<string, { session: string; householdId: string; memberId: string | null; at: number }>();
  const redirectUri = (req: FastifyRequest) => `${opts.publicUrl ?? `${req.protocol}://${req.host}`}/api/account/google/callback`;
  const backToApp = (reply: FastifyReply, result: string) => reply.redirect(`/?calendar=${encodeURIComponent(result)}`);

  app.get('/api/account/google/connect', async (req, reply) => {
    const s = sessionOf(req);
    const c = s && contextOf(s);
    if (!opts.googleCalendar) return backToApp(reply, 'Google Calendar is not set up on this server');
    // Someone's own account: the wall or a kid's device without an account can't connect one.
    if (!s || !c?.household || s.kind !== 'user') return backToApp(reply, 'Sign in with your own account to connect your calendar');
    for (const [k, v] of googleStates) if (v.at < Date.now() - 15 * 60_000) googleStates.delete(k);
    const state = randomBytes(24).toString('base64url');
    googleStates.set(state, { session: s.token_hash, householdId: c.household.id, memberId: c.membership?.member_id ?? null, at: Date.now() });
    const email = (accounts.prepare('SELECT email FROM users WHERE id = ?').get(s.user_id) as { email: string | null } | undefined)?.email;
    return reply.redirect(opts.googleCalendar.authUrl(redirectUri(req), state, email));
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/api/account/google/callback', async (req, reply) => {
    const pending = req.query.state ? googleStates.get(req.query.state) : undefined;
    if (req.query.state) googleStates.delete(req.query.state);
    // Same device that started it, so a link from someone else can't attach their calendar to you.
    if (!pending || sessionOf(req)?.token_hash !== pending.session) return backToApp(reply, 'That took too long. Try connecting again.');
    if (req.query.error || !req.query.code) return backToApp(reply, req.query.error === 'access_denied' ? 'Not connected' : 'Google said no. Try again.');
    const h = householdById(pending.householdId);
    const target = h && (await households.get(h));
    if (!target?.google) return backToApp(reply, 'Google Calendar is not set up on this server');
    try {
      const { refreshToken, account } = await opts.googleCalendar!.exchange(req.query.code, redirectUri(req));
      target.google.connect({ memberId: pending.memberId, account, refreshToken });
      return backToApp(reply, 'connected');
    } catch (err) {
      req.log.warn({ err }, 'Google Calendar connect failed');
      return backToApp(reply, (err as Error).message);
    }
  });

  // For the host's health check: up, and the accounts database answers.
  app.get('/health', async () => {
    accounts.prepare('SELECT 1').get();
    return { ok: true };
  });

  // ---- Built UI (production) ---------------------------------------------
  if (opts.webDist && existsSync(opts.webDist)) app.register(fastifyStatic, { root: opts.webDist });

  return { app, handle, close: async () => { await app.close(); await households.closeAll(); } };
}

/**
 * The household from before accounts (data/calendar.db) becomes the first household. Until a
 * guardian claims it, each start logs a code to claim it with: sign in, then join with the code.
 */
export function adoptLegacy(accounts: AccountsDB, dataDir: string, dbFile: string, photosDir: string, log: (msg: string) => void) {
  let h = accounts.prepare('SELECT * FROM households WHERE legacy = 1').get() as HouseholdRow | undefined;
  if (!h) {
    if (!existsSync(dbFile)) return;
    accounts.prepare('INSERT INTO households (id, name, db_file, photos_dir, legacy) VALUES (?, ?, ?, ?, 1)')
      .run(randomUUID(), 'Home', toStored(dataDir, dbFile), toStored(dataDir, photosDir));
    h = accounts.prepare('SELECT * FROM households WHERE legacy = 1').get() as HouseholdRow;
  }
  if (accounts.prepare(`SELECT 1 FROM memberships WHERE household_id = ? AND role = 'guardian'`).get(h.id)) return;
  const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  accounts.transaction(() => {
    accounts.prepare('DELETE FROM invites WHERE household_id = ? AND member_id IS NULL AND new_name IS NULL').run(h.id);
    accounts.prepare(`INSERT INTO invites (code_hash, household_id, kind, expires_at) VALUES (?, ?, 'guardian', ?)`)
      .run(sha(code), h.id, later(30 * 86_400_000));
  })();
  log(`Claim your household: sign in, tap "Join with a code" and enter ${showCode(code)}`);
}
