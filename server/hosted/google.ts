import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { AccountsDB, SessionRow } from '../accounts.ts';
import type { HouseholdRegistry } from '../households.ts';
import type { ServerOptions, Sessions } from './session.ts';

// Connecting Google Calendar. The page links here; Google asks the person to allow access, then comes
// back to the callback, which hands the account to their household to sync. Back on the app, Settings
// shows it.
//
// The phone app opens it in a Safari sheet instead, which has no cookie (and Google won't sign in inside
// the app itself). So the app first asks for a one-time link, good for two minutes. Visiting it gives the
// sheet a cookie of its own for this connection, which the callback checks instead of the session's, and
// it ends on a page that says to tap Done.

const LINK_MS = 2 * 60_000;
const SHEET_COOKIE = 'google_connect';

const escape = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** The page the app's Safari sheet ends on. */
const sheetPage = (result: string) => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Google Calendar · Sprig</title>
		<link rel="stylesheet" href="/pages/pages.css" />
	</head>
	<body>
		<main>
			<h1>${result === 'connected' ? 'Google Calendar connected' : 'Not connected'}</h1>
			<p>${result === 'connected' ? 'Its events show in Sprig in a minute or so.' : escape(result)}</p>
			<p>Tap <strong>Done</strong> to go back to Sprig.</p>
		</main>
	</body>
</html>
`;

export function googleRoutes(
	app: FastifyInstance,
	accounts: AccountsDB,
	households: HouseholdRegistry,
	{ sessionOf, contextOf, householdById }: Sessions,
	opts: ServerOptions,
) {
	const googleStates = new Map<
		string,
		{ session: string; sheet?: string; householdId: string; memberId: string | null; at: number }
	>();
	const links = new Map<string, { session: string; at: number }>();
	const redirectUri = (req: FastifyRequest) =>
		`${opts.publicUrl ?? `${req.protocol}://${req.host}`}/api/account/google/callback`;
	const backToApp = (reply: FastifyReply, result: string, sheet: boolean) =>
		sheet
			? reply.type('text/html').send(sheetPage(result))
			: reply.redirect(`/?calendar=${encodeURIComponent(result)}`);
	const sheetCookie = (req: FastifyRequest) =>
		new RegExp(`(?:^|;\\s*)${SHEET_COOKIE}=([^;]+)`).exec(req.headers.cookie ?? '')?.[1];

	// The phone app's one-time link (see the top).
	app.post('/api/account/google/link', async (req, reply) => {
		const s = sessionOf(req);
		if (!s || s.kind !== 'user') return reply.code(401).send({ error: 'Sign in with your own account first' });
		for (const [k, v] of links) if (v.at < Date.now() - LINK_MS) links.delete(k);
		const link = randomBytes(24).toString('base64url');
		links.set(link, { session: s.token_hash, at: Date.now() });
		return { url: `${opts.publicUrl ?? `${req.protocol}://${req.host}`}/api/account/google/connect?link=${link}` };
	});

	app.get<{ Querystring: { link?: string } }>('/api/account/google/connect', async (req, reply) => {
		const sheet = req.query.link !== undefined;
		const link = sheet ? links.get(req.query.link!) : undefined;
		if (sheet) links.delete(req.query.link!);
		if (sheet && (!link || link.at < Date.now() - LINK_MS))
			return backToApp(reply, 'That took too long. Try connecting again.', true);
		const s = link
			? (accounts.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(link.session) as SessionRow | undefined)
			: sessionOf(req);
		const c = s && contextOf(s);
		if (!opts.googleCalendar) return backToApp(reply, 'Google Calendar is not set up on this server', sheet);
		// Someone's own account: the wall or a kid's device without an account can't connect one.
		if (!s || !c?.household || s.kind !== 'user')
			return backToApp(reply, 'Sign in with your own account to connect your calendar', sheet);
		for (const [k, v] of googleStates) if (v.at < Date.now() - 15 * 60_000) googleStates.delete(k);
		const state = randomBytes(24).toString('base64url');
		const sheetKey = sheet ? randomBytes(24).toString('base64url') : undefined;
		if (sheetKey)
			reply.header(
				'set-cookie',
				`${SHEET_COOKIE}=${sheetKey}; Path=/api/account/google; Max-Age=900; HttpOnly; SameSite=Lax${req.protocol === 'https' ? '; Secure' : ''}`,
			);
		googleStates.set(state, {
			session: s.token_hash,
			sheet: sheetKey,
			householdId: c.household.id,
			memberId: c.membership?.member_id ?? null,
			at: Date.now(),
		});
		const email = (
			accounts.prepare('SELECT email FROM users WHERE id = ?').get(s.user_id) as { email: string | null } | undefined
		)?.email;
		return reply.redirect(opts.googleCalendar.authUrl(redirectUri(req), state, email));
	});

	app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
		'/api/account/google/callback',
		async (req, reply) => {
			const pending = req.query.state ? googleStates.get(req.query.state) : undefined;
			if (req.query.state) googleStates.delete(req.query.state);
			const sheet = !!(pending?.sheet ?? sheetCookie(req));
			// Same device that started it (for the app, the same sheet), so a link from someone else can't
			// attach their calendar to you.
			const same = pending?.sheet
				? sheetCookie(req) === pending.sheet
				: !!pending && sessionOf(req)?.token_hash === pending.session;
			if (!pending || !same) return backToApp(reply, 'That took too long. Try connecting again.', sheet);
			if (req.query.error || !req.query.code)
				return backToApp(
					reply,
					req.query.error === 'access_denied' ? 'Not connected' : 'Google said no. Try again.',
					sheet,
				);
			const h = householdById(pending.householdId);
			const target = h && (await households.get(h));
			if (!target?.google) return backToApp(reply, 'Google Calendar is not set up on this server', sheet);
			try {
				const { refreshToken, account } = await opts.googleCalendar!.exchange(req.query.code, redirectUri(req));
				target.google.connect({ memberId: pending.memberId, account, refreshToken });
				return backToApp(reply, 'connected', sheet);
			} catch (err) {
				req.log.warn({ err }, 'Google Calendar connect failed');
				return backToApp(reply, (err as Error).message, sheet);
			}
		},
	);
}
