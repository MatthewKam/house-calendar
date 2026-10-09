import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DB } from './db.ts';

// A family PIN. Until one is set, the app is open (as before) and Settings offers to set one. Once
// it's set, every /api call needs a signed-in device: the PIN is typed once and the device stays
// signed in for a year (a cookie), until it's signed out in Settings. Phones' Reminders Shortcut
// keeps using its own token. Five wrong PINs lock that device out for 15 minutes.
// A master PIN, when set, is the one that can change the family PIN (and it signs in too), so
// knowing the family PIN isn't enough to change it. The app can't change the master PIN itself.

const COOKIE = 'household_session';
const YEAR_S = 365 * 24 * 3600;
const MAX_TRIES = 5;
const LOCK_MS = 15 * 60_000;
const PIN = { type: 'string', minLength: 4, maxLength: 64 } as const;

/** Paths that work without signing in: the sign-in itself, and the Shortcut (it has its own token). */
const OPEN = [/^\/api\/auth\//, /^\/api\/reminders\/phone\//];

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`;
}
function pinMatches(pin: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const got = scryptSync(pin, salt, 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Checks the PIN for parent-only actions (e.g. taking stars back out of a jar): the master PIN, or
 * the family PIN if there's no master PIN. Five wrong tries lock it for 15 minutes, as for signing in.
 * The checker returns what's wrong, or null when the PIN is right.
 */
export function parentPin(db: DB) {
  const tries = new Map<string, { n: number; until: number }>();
  return (pin: string, ip: string): string | null => {
    const row = db.prepare('SELECT pin_hash, master_hash FROM auth WHERE id = 1').get() as
      { pin_hash: string; master_hash: string | null } | undefined;
    const want = row?.master_hash ?? row?.pin_hash;
    if (!want) return null;
    const t = tries.get(ip);
    if (t && t.until > Date.now()) return `Too many wrong tries. Try again in ${Math.ceil((t.until - Date.now()) / 60_000)} min.`;
    if (pinMatches(pin, want)) {
      tries.delete(ip);
      return null;
    }
    const n = (t?.n ?? 0) + 1;
    tries.set(ip, n >= MAX_TRIES ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 });
    return n >= MAX_TRIES ? 'Too many wrong tries. Try again in 15 min.' : 'Wrong PIN';
  };
}

/**
 * Changes that need a parent (the master PIN): everything except what the kids do themselves
 * (ticking tasks, putting stars in jars, redeeming, uploading photos, adding and ticking list items).
 * By route, and for a few routes by what's being changed.
 */
type Req = FastifyRequest<{ Params: Record<string, string>; Body: Record<string, unknown> | undefined }>;
const PARENT_ONLY: [method: string, route: string, when?: (req: Req) => boolean][] = [
  ['POST', '/api/events'], ['PATCH', '/api/events/:id'], ['DELETE', '/api/events/:id'], ['POST', '/api/events/:id/restore'],
  ['PUT', '/api/events/:id/people'], ['POST', '/api/outbox/:id/resolve'], ['POST', '/api/alerts'], ['DELETE', '/api/alerts/:id'],
  ['POST', '/api/tasks'], ['PATCH', '/api/tasks/:id'], ['DELETE', '/api/tasks/:id'], ['PUT', '/api/tasks/order'],
  ['POST', '/api/rewards'], ['PATCH', '/api/rewards/:id'], ['DELETE', '/api/rewards/:id'], ['POST', '/api/rewards/:id/restore'],
  ['POST', '/api/members'], ['PATCH', '/api/members/:id'], ['DELETE', '/api/members/:id'], ['PATCH', '/api/calendars/:id'],
  // Month or week is anyone's choice; the rest of Settings isn't.
  ['PUT', '/api/settings/:key', (req) => req.params.key !== 'view'],
  ['PATCH', '/api/photos/:id'], ['DELETE', '/api/photos/:id'], ['POST', '/api/photos/slideshow'], ['POST', '/api/photos/delete'],
  // Ticking a list item is fine; renaming it (or its icon) isn't.
  ['PATCH', '/api/reminders/:id', (req) => req.body?.title !== undefined],
  ['POST', '/api/auth/devices/:id/sign-out'],
];
const needsParent = (req: Req) =>
  PARENT_ONLY.some(([method, route, when]) => req.method === method && req.routeOptions.url === route && (!when || when(req)));

/** How long an unlock lasts (each parent change starts it over), unless the device is kept unlocked. */
const PARENT_MS = 10 * 60_000;

/** The session token from the Cookie header, if any. */
function tokenOf(req: FastifyRequest) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie ?? '');
  return m?.[1] ?? null;
}

/** "iPhone · Safari", "Mac · Chrome": enough to tell devices apart in Settings. */
function deviceLabel(ua = '') {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux (the wall?)' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${device} · ${browser}`;
}

export function registerAuth(app: FastifyInstance, db: DB) {
  const pinHash = () => (db.prepare('SELECT pin_hash FROM auth WHERE id = 1').get() as { pin_hash: string } | undefined)?.pin_hash;
  const masterHash = () => (db.prepare('SELECT master_hash FROM auth WHERE id = 1').get() as { master_hash: string | null } | undefined)?.master_hash ?? null;
  const sessionFor = (req: FastifyRequest) => {
    const token = tokenOf(req);
    if (!token) return null;
    return (db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha(token)) as { token_hash: string } | undefined) ?? null;
  };
  /**
   * Unlocked for parent changes: when there's no PIN at all (the app is open, as before), or this
   * device was unlocked with the master PIN, a while ago or for good.
   */
  const parentUntil = (req: FastifyRequest) =>
    (sessionFor(req) as { parent_until?: string | null } | null)?.parent_until ?? null;
  const isParent = (req: FastifyRequest) => {
    if (!pinHash()) return true;
    const until = parentUntil(req);
    return !!until && (until === 'always' || until > new Date().toISOString());
  };
  const setParent = (req: FastifyRequest, until: string | null) => {
    const token = tokenOf(req);
    if (token) db.prepare('UPDATE sessions SET parent_until = ? WHERE token_hash = ?').run(until, sha(token));
  };
  const checkParentPin = parentPin(db);

  // Wrong tries, per address.
  const tries = new Map<string, { n: number; until: number }>();

  /** Signs this device in: a new session and its cookie. */
  function signIn(req: FastifyRequest, reply: FastifyReply) {
    // Devices unused for longer than a cookie lasts are signed out for good.
    db.prepare(`DELETE FROM sessions WHERE last_seen < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${YEAR_S} seconds')`).run();
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions (token_hash, label) VALUES (?, ?)').run(sha(token), deviceLabel(req.headers['user-agent']));
    const secure = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
    reply.header('set-cookie', `${COOKIE}=${token}; Path=/; Max-Age=${YEAR_S}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
  }

  // Every /api call needs a signed-in device once a PIN is set.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || OPEN.some((p) => p.test(req.url)) || !pinHash()) return;
    const session = sessionFor(req);
    if (!session) return reply.code(401).send({ error: 'Sign in with the family PIN' });
    db.prepare(`UPDATE sessions SET last_seen = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash = ?`).run(session.token_hash);
  });

  // Parent changes from a locked device are refused; a parent's change keeps the unlock going.
  app.addHook('preHandler', async (req, reply) => {
    if (!needsParent(req as Req)) return;
    if (!isParent(req)) return reply.code(403).send({ error: 'Locked: unlock with the parent PIN to change this', locked: true });
    if (pinHash() && parentUntil(req) !== 'always') setParent(req, new Date(Date.now() + PARENT_MS).toISOString());
  });

  app.get('/api/auth/status', async (req) => ({
    pinSet: !!pinHash(), masterSet: !!masterHash(), signedIn: !pinHash() || !!sessionFor(req),
    parent: isParent(req), parentKept: parentUntil(req) === 'always',
  }));

  // Unlocks this device for parent changes with the master PIN: for 10 minutes (more with each
  // change), or for good on a parent's own phone (`keep`).
  app.post<{ Body: { pin: string; keep?: boolean } }>('/api/auth/parent', {
    schema: { body: { type: 'object', required: ['pin'], additionalProperties: false,
      properties: { pin: { type: 'string', minLength: 1, maxLength: 64 }, keep: { type: 'boolean' } } } },
  }, async (req, reply) => {
    if (!pinHash()) return { parent: true, parentKept: false };
    if (!sessionFor(req)) return reply.code(401).send({ error: 'Sign in first' });
    const wrong = checkParentPin(req.body.pin, req.ip);
    if (wrong) return reply.code(403).send({ error: wrong });
    setParent(req, req.body.keep ? 'always' : new Date(Date.now() + PARENT_MS).toISOString());
    return { parent: true, parentKept: !!req.body.keep };
  });

  // Locks this device again.
  app.post('/api/auth/parent/lock', async (req) => {
    setParent(req, null);
    return { parent: !pinHash(), parentKept: false };
  });

  app.post<{ Body: { pin: string } }>('/api/auth/login', {
    schema: { body: { type: 'object', required: ['pin'], additionalProperties: false, properties: { pin: PIN } } },
  }, async (req, reply) => {
    const stored = pinHash();
    if (!stored) return reply.code(400).send({ error: 'No PIN is set yet' });
    const t = tries.get(req.ip);
    if (t && t.until > Date.now()) {
      return reply.code(429).send({ error: `Too many wrong tries. Try again in ${Math.ceil((t.until - Date.now()) / 60_000)} min.` });
    }
    const master = masterHash();
    if (!pinMatches(req.body.pin, stored) && !(master && pinMatches(req.body.pin, master))) {
      const n = (t && t.until > 0 && t.until <= Date.now() ? 0 : t?.n ?? 0) + 1;
      tries.set(req.ip, { n: n >= MAX_TRIES ? 0 : n, until: n >= MAX_TRIES ? Date.now() + LOCK_MS : 0 });
      return reply.code(401).send({ error: n >= MAX_TRIES ? 'Too many wrong tries. Try again in 15 min.' : 'Wrong PIN' });
    }
    tries.delete(req.ip);
    signIn(req, reply);
    return { signedIn: true };
  });

  // Sets the first PIN (open to anyone until then, as the app was), or changes it: signed in, with
  // the master PIN (or, if there's no master PIN, the current PIN). The device setting it stays
  // signed in; with signOutOthers, every other is signed out.
  app.post<{ Body: { pin: string; currentPin?: string; masterPin?: string; signOutOthers?: boolean } }>('/api/auth/pin', {
    schema: { body: { type: 'object', required: ['pin'], additionalProperties: false,
      properties: { pin: PIN, currentPin: PIN, masterPin: PIN, signOutOthers: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const stored = pinHash();
    const master = masterHash();
    if (stored) {
      if (!sessionFor(req)) return reply.code(401).send({ error: 'Sign in first' });
      if (master ? !req.body.masterPin || !pinMatches(req.body.masterPin, master)
        : !req.body.currentPin || !pinMatches(req.body.currentPin, stored)) {
        return reply.code(401).send({ error: master ? 'The master PIN is wrong' : 'The current PIN is wrong' });
      }
    }
    const mine = sessionFor(req);
    db.transaction(() => {
      db.prepare('INSERT INTO auth (id, pin_hash) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET pin_hash = excluded.pin_hash, set_at = excluded.set_at')
        .run(hashPin(req.body.pin));
      if (req.body.signOutOthers) db.prepare('DELETE FROM sessions WHERE token_hash != ?').run(mine?.token_hash ?? '');
    })();
    if (!mine) signIn(req, reply);
    return { pinSet: true };
  });

  // Devices signed in, for Settings (this one marked).
  app.get('/api/auth/devices', async (req, reply) => {
    const mine = sessionFor(req);
    if (pinHash() && !mine) return reply.code(401).send({ error: 'Sign in with the family PIN' });
    return (db.prepare('SELECT token_hash, label, created_at, last_seen FROM sessions ORDER BY last_seen DESC').all() as
      { token_hash: string; label: string; created_at: string; last_seen: string }[])
      .map((s) => ({ id: s.token_hash.slice(0, 16), label: s.label, signedInAt: s.created_at, lastSeen: s.last_seen, thisDevice: s.token_hash === mine?.token_hash }));
  });

  app.post<{ Params: { id: string } }>('/api/auth/devices/:id/sign-out', async (req, reply) => {
    const mine = sessionFor(req);
    if (pinHash() && !mine) return reply.code(401).send({ error: 'Sign in with the family PIN' });
    const res = db.prepare('DELETE FROM sessions WHERE substr(token_hash, 1, 16) = ?').run(req.params.id);
    if (!res.changes) return reply.code(404).send({ error: 'Device not found' });
    return reply.code(204).send();
  });
}
