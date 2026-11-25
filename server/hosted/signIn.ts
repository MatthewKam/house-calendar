import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomInt, randomUUID } from 'node:crypto';
import type { AccountsDB } from '../accounts.ts';
import type { Identity } from '../identity.ts';
import { hashPin, pinMatches } from '../auth.ts';
import {
	CODE_MS,
	COOKIE,
	MAX_TRIES,
	later,
	limiter,
	now,
	windowLimit,
	type ServerOptions,
	type Sessions,
} from './session.ts';

// Signing in: with Apple or Google, or a code by email; and signing out.

export function signInRoutes(
	app: FastifyInstance,
	accounts: AccountsDB,
	{ started, sessionOf, startSession, status }: Sessions,
	opts: ServerOptions,
) {
	const HOUR = 60 * 60_000;
	const codesPerEmail = windowLimit(5, HOUR);
	const codesPerDevice = windowLimit(10, HOUR);
	const wrongCodes = limiter();

	/** The user for an identity: the same one as last time, or one with the same verified email, or new. */
	function userFor(provider: 'google' | 'apple' | 'email', id: Identity) {
		const known = accounts
			.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?')
			.get(provider, id.subject) as { user_id: string } | undefined;
		if (known) return known.user_id;
		return accounts.transaction(() => {
			let userId = id.email
				? (accounts.prepare('SELECT id FROM users WHERE email = ?').get(id.email) as { id: string } | undefined)?.id
				: undefined;
			if (!userId) {
				userId = randomUUID();
				accounts
					.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)')
					.run(userId, id.name?.trim() || id.email?.split('@')[0] || 'New user', id.email);
			}
			accounts
				.prepare('INSERT INTO identities (provider, subject, user_id, email) VALUES (?, ?, ?, ?)')
				.run(provider, id.subject, userId, id.email);
			return userId;
		})();
	}

	/** Signs this device in as the user, in their most recent household (if any). */
	function signInUser(req: FastifyRequest, reply: FastifyReply, userId: string) {
		const h = accounts
			.prepare('SELECT household_id FROM memberships WHERE user_id = ? ORDER BY created_at DESC')
			.get(userId) as { household_id: string } | undefined;
		startSession(req, reply, { kind: 'user', user_id: userId, household_id: h?.household_id ?? null });
		return status(req);
	}

	app.get('/api/account/config', async () => ({
		google: opts.google?.clientId ?? null,
		// Sprig's own Google button (it needs the code swapped here); else Google's ready-made one.
		googleButton: !!opts.google?.signInCode,
		apple: opts.apple?.clientId ?? null,
		email: !!opts.sendCode,
		// The site's demo (hosted/demo.ts).
		demo: true,
	}));

	app.post<{ Params: { provider: 'google' | 'apple' }; Body: { idToken: string; name?: string } }>(
		'/api/account/signin/:provider',
		{
			schema: {
				params: { type: 'object', properties: { provider: { type: 'string', enum: ['google', 'apple'] } } },
				body: {
					type: 'object',
					required: ['idToken'],
					additionalProperties: false,
					properties: {
						idToken: { type: 'string', minLength: 10, maxLength: 8192 },
						name: { type: 'string', maxLength: 80 },
					},
				},
			},
		},
		async (req, reply) => {
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
		},
	);

	// Sprig's own Google button: Google's sign-in window gave the page a one-time code.
	app.post<{ Body: { code: string } }>(
		'/api/account/signin/google/code',
		{
			schema: {
				body: {
					type: 'object',
					required: ['code'],
					additionalProperties: false,
					properties: { code: { type: 'string', minLength: 10, maxLength: 2048 } },
				},
			},
		},
		async (req, reply) => {
			const google = opts.google;
			if (!google?.signInCode) return reply.code(400).send({ error: 'That way of signing in is off' });
			let id: Identity;
			try {
				id = await google.verify(await google.signInCode(req.body.code));
			} catch (err) {
				req.log.warn({ err }, 'Google sign-in code refused');
				return reply.code(401).send({ error: 'That sign-in didn’t work. Try again.' });
			}
			return signInUser(req, reply, userFor('google', id));
		},
	);

	app.post<{ Body: { email: string } }>(
		'/api/account/email/start',
		{
			schema: {
				body: {
					type: 'object',
					required: ['email'],
					additionalProperties: false,
					properties: { email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', maxLength: 200 } },
				},
			},
		},
		async (req, reply) => {
			if (!opts.sendCode) return reply.code(400).send({ error: 'Email sign-in is off' });
			const email = req.body.email.trim().toLowerCase();
			// A few codes an hour per address and per device: no flooding someone's inbox, or ours.
			if (!codesPerEmail.take(email) || !codesPerDevice.take(req.ip)) {
				return reply.code(429).send({ error: 'Too many codes asked for. Try again in a while.' });
			}
			const last = accounts.prepare('SELECT sent_at FROM email_codes WHERE email = ?').get(email) as
				{ sent_at: string } | undefined;
			if (last && last.sent_at > new Date(Date.now() - 30_000).toISOString()) {
				return reply.code(429).send({ error: 'A code was just sent. Wait a moment before asking for another.' });
			}
			const review = opts.review?.email === email;
			const code = review ? opts.review!.code : String(randomInt(0, 1_000_000)).padStart(6, '0');
			accounts
				.prepare(
					`INSERT INTO email_codes (email, code_hash, sent_at, expires_at, tries) VALUES (?, ?, ?, ?, 0)
      ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, sent_at = excluded.sent_at, expires_at = excluded.expires_at, tries = 0`,
				)
				.run(email, hashPin(code), now(), later(CODE_MS));
			if (!review) await opts.sendCode(email, code);
			return { sent: true };
		},
	);

	app.post<{ Body: { email: string; code: string } }>(
		'/api/account/email/verify',
		{
			schema: {
				body: {
					type: 'object',
					required: ['email', 'code'],
					additionalProperties: false,
					properties: { email: { type: 'string', maxLength: 200 }, code: { type: 'string', maxLength: 12 } },
				},
			},
		},
		async (req, reply) => {
			// Wrong codes from one device lock it a while, whichever addresses it tries (App Review's fixed
			// code too, whose tries would otherwise start over with each code asked for).
			const blocked = wrongCodes.blocked(req.ip);
			if (blocked) return reply.code(429).send({ error: blocked });
			const email = req.body.email.trim().toLowerCase();
			const row = accounts.prepare('SELECT * FROM email_codes WHERE email = ?').get(email) as
				{ code_hash: string; expires_at: string; tries: number } | undefined;
			if (!row || row.expires_at < now() || row.tries >= MAX_TRIES)
				return reply.code(401).send({ error: 'That code has expired. Ask for a new one.' });
			if (!pinMatches(req.body.code.replace(/\D/g, ''), row.code_hash)) {
				accounts.prepare('UPDATE email_codes SET tries = tries + 1 WHERE email = ?').run(email);
				wrongCodes.wrong(req.ip);
				return reply.code(401).send({ error: 'Wrong code' });
			}
			accounts.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
			return signInUser(req, reply, userFor('email', { subject: email, email, name: null }));
		},
	);

	app.post('/api/account/signout', async (req, reply) => {
		const s = sessionOf(req);
		if (s) accounts.prepare('DELETE FROM sessions WHERE token_hash = ?').run(s.token_hash);
		started.delete(req.raw);
		reply.header('set-cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
		return reply.code(204).send();
	});
}
