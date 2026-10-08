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

  app.get('/api/auth/status', async (req) => ({ pinSet: !!pinHash(), masterSet: !!masterHash(), signedIn: !pinHash() || !!sessionFor(req) }));

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
