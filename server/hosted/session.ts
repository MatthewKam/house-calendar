import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IncomingMessage } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AccountsDB, HouseholdRow, MembershipRow, SessionRow } from '../accounts.ts';
import type { HouseholdRegistry } from '../households.ts';
import type { SendCode, VerifyToken } from '../identity.ts';
import type { GoogleOAuth } from '../providers/google.ts';
import { deviceLabel, sha } from '../auth.ts';

// What the hosted front's routes share: who a request's session is, in which household and as whom,
// whether it may change things, starting a session, and the status the app reads.

export const COOKIE = 'household_session';
const YEAR_S = 365 * 24 * 3600;
export const PARENT_MS = 10 * 60_000;
export const MAX_TRIES = 5;
const LOCK_MS = 15 * 60_000;
export const CODE_MS = 10 * 60_000;
export const INVITE_MS = { guardian: 7 * 86_400_000, kid: 7 * 86_400_000, wall: 15 * 60_000 } as const;
const COLORS = ['#2f7de1', '#e0457b', '#f29d38', '#3fae6a', '#8e5bd6', '#14a3a8', '#d4513b', '#6b7a8f'];
/** Invite codes: no 0/O or 1/I, so they're easy to read out and type. */
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const now = () => new Date().toISOString();
export const later = (ms: number) => new Date(Date.now() + ms).toISOString();
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const showCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
export const PIN = { type: 'string', pattern: '^[0-9]{4,8}$' } as const;
export const NAME = { type: 'string', minLength: 1, maxLength: 40 } as const;

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

/** Tries per key (an address, or a device for PINs); five wrong ones lock it for 15 minutes. */
export function limiter() {
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

/** Sessions and who they are, over the accounts database. */
export function sessions(accounts: AccountsDB, households: HouseholdRegistry) {
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
  /**
   * The household's account holder (a membership). Theirs if they're still a guardian in it; otherwise
   * (taken out, or a household from before) the longest-standing guardian takes it on.
   */
  function holderOf(householdId: string): string | null {
    const h = accounts.prepare('SELECT holder_id FROM households WHERE id = ?').get(householdId) as { holder_id: string | null } | undefined;
    if (h?.holder_id && accounts.prepare(`SELECT 1 FROM memberships WHERE id = ? AND household_id = ? AND role = 'guardian'`).get(h.holder_id, householdId)) return h.holder_id;
    const first = accounts.prepare(`SELECT id FROM memberships WHERE household_id = ? AND role = 'guardian' ORDER BY created_at, rowid LIMIT 1`)
      .get(householdId) as { id: string } | undefined;
    accounts.prepare('UPDATE households SET holder_id = ? WHERE id = ?').run(first?.id ?? null, householdId);
    return first?.id ?? null;
  }
  /** The holder, on their own device or one they unlocked with their PIN. */
  const isHolder = (c: Ctx) => {
    if (!c.household || !isParent(c)) return false;
    const holder = holderOf(c.household.id);
    return !!holder && (ownParent(c) ? c.membership?.id === holder : c.s.parent_by === holder);
  };
  /** The guardians, as members of the household's own database. */
  const guardiansOf = (householdId: string) => (accounts.prepare(`SELECT member_id FROM memberships WHERE household_id = ? AND role = 'guardian'`)
    .all(householdId) as { member_id: string }[]).map((r) => r.member_id);

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
    const holder = c.household ? holderOf(c.household.id) : null;
    const holderMember = holder ? accounts.prepare('SELECT member_id FROM memberships WHERE id = ?').get(holder) as { member_id: string } | undefined : undefined;
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
      /** This is the account holder (or a device they unlocked): approves color changes, and the wall wears their accent. */
      holder: isHolder(c),
      holderName: people.find((m) => m.id === holderMember?.member_id)?.name ?? null,
      hasPin: !!c.membership?.pin_hash,
      guardianPins,
      /** How long every guardian's PIN is, when they're all the same (and known): the pad checks it at that length. */
      pinLength: pinLengths.length && pinLengths.every((n) => n !== null && n === pinLengths[0]) ? pinLengths[0] : null,
    };
  }

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

  return { started, sessionOf, householdById, contextOf, ownParent, isParent, holderOf, isHolder, guardiansOf, setParentUntil, startSession, addMember,
    membersOf, status, needUser, needParent };
}
export type Sessions = ReturnType<typeof sessions>;
