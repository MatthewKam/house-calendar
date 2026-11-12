import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { AccountsDB } from '../accounts.ts';
import type { HouseholdRegistry } from '../households.ts';
import type { ServerOptions, Sessions } from './session.ts';

// Connecting Google Calendar. The page links here; Google asks the person to allow access, then comes
// back to the callback, which hands the account to their household to sync. Back on the app, Settings
// shows it.

export function googleRoutes(app: FastifyInstance, accounts: AccountsDB, households: HouseholdRegistry, { sessionOf, contextOf, householdById }: Sessions, opts: ServerOptions) {
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
}
