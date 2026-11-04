import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Who is asking, as the front server (hosted.ts) worked out from the sign-in: a guardian, a kid, or
// the family wall. Guardians signed in on their own phone can change anything; a wall or a kid's
// device needs a guardian's PIN first (the parent unlock) for the changes listed below. Without a
// viewer (tests, or a household app used on its own) everything is open.

export interface Viewer {
  role: 'guardian' | 'kid' | 'wall';
  /** The person in this household's members, for a guardian or kid. */
  memberId: string | null;
  /** May make parent-only changes right now. */
  parent: boolean;
  /** A parent-only change was made: keeps a wall or kid device's unlock going. */
  stillParent(): void;
}

declare module 'node:http' {
  interface IncomingMessage { viewer?: Viewer }
}

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`;
}
export function pinMatches(pin: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const got = scryptSync(pin, salt, 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** "iPhone · Safari", "Mac · Chrome": enough to tell devices apart in Settings. */
export function deviceLabel(ua = '') {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${device} · ${browser}`;
}

/**
 * Changes that need a parent: everything except what the kids do themselves (ticking tasks, putting
 * stars in jars, redeeming, uploading photos, adding and ticking list items). By route, and for a few
 * routes by what's being changed.
 */
type Req = FastifyRequest<{ Params: Record<string, string>; Body: Record<string, unknown> | undefined }>;
const PARENT_ONLY: [method: string, route: string, when?: (req: Req) => boolean][] = [
  ['POST', '/api/events'], ['PATCH', '/api/events/:id'], ['DELETE', '/api/events/:id'], ['POST', '/api/events/:id/restore'],
  ['PUT', '/api/events/:id/people'], ['POST', '/api/outbox/:id/resolve'], ['POST', '/api/connections/icloud'], ['POST', '/api/alerts'], ['DELETE', '/api/alerts/:id'],
  ['POST', '/api/tasks'], ['PATCH', '/api/tasks/:id'], ['DELETE', '/api/tasks/:id'], ['PUT', '/api/tasks/order'],
  ['POST', '/api/rewards'], ['PATCH', '/api/rewards/:id'], ['DELETE', '/api/rewards/:id'], ['POST', '/api/rewards/:id/restore'],
  ['POST', '/api/rewards/:id/take-back'],
  ['POST', '/api/members'], ['PATCH', '/api/members/:id'], ['DELETE', '/api/members/:id'], ['PATCH', '/api/calendars/:id'],
  // Month or week is anyone's choice; the rest of Settings isn't.
  ['PUT', '/api/settings/:key', (req) => req.params.key !== 'view'],
  ['PATCH', '/api/photos/:id'], ['DELETE', '/api/photos/:id'], ['POST', '/api/photos/slideshow'], ['POST', '/api/photos/delete'],
  // Ticking a list item is fine; renaming it (or its icon) isn't.
  ['PATCH', '/api/reminders/:id', (req) => req.body?.title !== undefined],
];
const needsParent = (req: Req) =>
  PARENT_ONLY.some(([method, route, when]) => req.method === method && req.routeOptions.url === route && (!when || when(req)));

/** Parent changes from a locked device are refused; a parent's change keeps the unlock going. */
export function registerGuard(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    const viewer = req.raw.viewer;
    if (!viewer || !needsParent(req as Req)) return;
    if (!viewer.parent) return reply.code(403).send({ error: "Locked: unlock with a guardian's PIN to change this", locked: true });
    viewer.stillParent();
  });
}
