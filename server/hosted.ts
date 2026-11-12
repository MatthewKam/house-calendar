import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { toStored, type AccountsDB, type HouseholdRow } from './accounts.ts';
import type { HouseholdRegistry } from './households.ts';
import { sha } from './auth.ts';
import { ALPHABET, PARENT_MS, later, now, sessions, showCode, type ServerOptions } from './hosted/session.ts';
import { signInRoutes } from './hosted/signIn.ts';
import { householdRoutes } from './hosted/household.ts';
import { unlockRoutes } from './hosted/unlock.ts';
import { googleRoutes } from './hosted/google.ts';

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
//
// Its routes are in hosted/: signing in, households and joining, the wall and the parent unlock, and
// connecting Google Calendar; hosted/session.ts is who a request's session is, shared by them all.

function sendJson(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
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
  const x = sessions(accounts, households);
  const { sessionOf, contextOf, ownParent, isParent, isHolder, guardiansOf, actorOf, setParentUntil } = x;

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
        holder: isHolder(c), guardians: guardiansOf(c.household.id), actor: actorOf(c),
        stillParent: () => { if (!ownParent(c)) setParentUntil(s, later(PARENT_MS)); },
      };
      return (await households.get(c.household)).app.routing(req, res);
    }
    rootHandler!(req, res);
  }

  signInRoutes(app, accounts, x, opts);
  app.get('/api/auth/status', async (req) => x.status(req));
  householdRoutes(app, accounts, x);
  unlockRoutes(app, accounts, x);
  googleRoutes(app, accounts, households, x, opts);

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
