import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import type { AccountsDB, MembershipRow } from '../accounts.ts';
import { hashPin, pinMatches } from '../auth.ts';
import { CODE_MS, MAX_TRIES, PIN, later, now, type ServerOptions, type Sessions } from './session.ts';

// A guardian's PIN: setting it (changing it takes the old one), a code by email for a forgotten one,
// and the account holder clearing another guardian's. A reset also lets every locked device try again.

export function pinRoutes(app: FastifyInstance, accounts: AccountsDB, x: Sessions, opts: ServerOptions) {
	const { contextOf, needUser, needParent, isHolder, status, pinTries, unlockAll } = x;

	/** The guardian on their own account, or a 401/403. */
	const guardianOf = (req: Parameters<typeof needUser>[0], reply: Parameters<typeof needUser>[1]) => {
		const s = needUser(req, reply);
		if (!s) return null;
		const c = contextOf(s);
		if (c.role !== 'guardian' || !c.membership || !c.household) {
			reply.code(403).send({ error: 'Only guardians have a PIN' });
			return null;
		}
		return { s, membership: c.membership, household: c.household };
	};
	const setPin = (membershipId: string, pin: string) =>
		accounts
			.prepare('UPDATE memberships SET pin_hash = ?, pin_length = ? WHERE id = ?')
			.run(hashPin(pin), pin.length, membershipId);

	// Sets this guardian's PIN; changing one takes the current PIN (checked like any PIN: five wrong, a wait).
	app.put<{ Body: { pin: string; current?: string } }>(
		'/api/account/pin',
		{
			schema: {
				body: {
					type: 'object',
					required: ['pin'],
					additionalProperties: false,
					properties: { pin: PIN, current: { type: 'string', maxLength: 12 } },
				},
			},
		},
		async (req, reply) => {
			const g = guardianOf(req, reply);
			if (!g) return;
			if (g.membership.pin_hash) {
				const blocked = pinTries.blocked(g.s.token_hash);
				if (blocked) return reply.code(429).send({ error: blocked });
				if (!req.body.current || !pinMatches(req.body.current, g.membership.pin_hash)) {
					pinTries.wrong(g.s.token_hash);
					return reply
						.code(403)
						.send({ error: req.body.current ? 'Your current PIN isn’t right' : 'Type your current PIN first' });
				}
				pinTries.clear(g.s.token_hash);
			}
			setPin(g.membership.id, req.body.pin);
			return status(req);
		},
	);

	// Forgot it: a code to the email this guardian signs in with (no email service: the server's log).
	app.post('/api/account/pin/forgot', async (req, reply) => {
		const g = guardianOf(req, reply);
		if (!g) return;
		const email = (
			accounts.prepare('SELECT email FROM users WHERE id = ?').get(g.s.user_id) as { email: string | null } | undefined
		)?.email;
		if (!opts.sendCode || !email)
			return reply.code(400).send({ error: 'No email to send a code to: ask the account holder to reset your PIN' });
		const last = accounts.prepare('SELECT sent_at FROM pin_resets WHERE membership_id = ?').get(g.membership.id) as
			{ sent_at: string } | undefined;
		if (last && Date.now() - Date.parse(last.sent_at) < 60_000)
			return reply.code(429).send({ error: 'A code was just sent. Wait a moment before asking for another.' });
		const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
		accounts
			.prepare(
				`INSERT INTO pin_resets (membership_id, code_hash, sent_at, expires_at, tries) VALUES (?, ?, ?, ?, 0)
      ON CONFLICT (membership_id) DO UPDATE SET code_hash = excluded.code_hash, sent_at = excluded.sent_at, expires_at = excluded.expires_at, tries = 0`,
			)
			.run(g.membership.id, hashPin(code), now(), later(CODE_MS));
		await opts.sendCode(email, code);
		return { sentTo: email };
	});

	// The emailed code and a new PIN.
	app.post<{ Body: { code: string; pin: string } }>(
		'/api/account/pin/reset',
		{
			schema: {
				body: {
					type: 'object',
					required: ['code', 'pin'],
					additionalProperties: false,
					properties: { code: { type: 'string', maxLength: 12 }, pin: PIN },
				},
			},
		},
		async (req, reply) => {
			const g = guardianOf(req, reply);
			if (!g) return;
			const row = accounts.prepare('SELECT * FROM pin_resets WHERE membership_id = ?').get(g.membership.id) as
				{ code_hash: string; expires_at: string; tries: number } | undefined;
			if (!row || row.expires_at < now() || row.tries >= MAX_TRIES)
				return reply.code(401).send({ error: 'That code has expired. Ask for a new one.' });
			if (!pinMatches(req.body.code.replace(/\D/g, ''), row.code_hash)) {
				accounts.prepare('UPDATE pin_resets SET tries = tries + 1 WHERE membership_id = ?').run(g.membership.id);
				return reply.code(401).send({ error: 'Wrong code' });
			}
			accounts.prepare('DELETE FROM pin_resets WHERE membership_id = ?').run(g.membership.id);
			setPin(g.membership.id, req.body.pin);
			unlockAll(g.household.id);
			return status(req);
		},
	);

	// A device locked by wrong PINs (a wall, a kid's): a guardian lets it try again now.
	app.post<{ Params: { id: string } }>('/api/account/devices/:id/unlock', async (req, reply) => {
		const c = needParent(req, reply);
		if (!c) return;
		const d = accounts
			.prepare('SELECT token_hash FROM sessions WHERE substr(token_hash, 1, 16) = ? AND household_id = ?')
			.get(req.params.id, c.household.id) as { token_hash: string } | undefined;
		if (!d) return reply.code(404).send({ error: 'Device not found' });
		pinTries.clear(d.token_hash);
		return reply.code(204).send();
	});

	// The account holder clears another guardian's PIN (they set a new one on their own phone).
	app.delete<{ Params: { id: string } }>('/api/account/memberships/:id/pin', async (req, reply) => {
		const c = needParent(req, reply);
		if (!c) return;
		if (!isHolder(c)) return reply.code(403).send({ error: 'Only the account holder can reset a PIN' });
		const m = accounts
			.prepare(`SELECT * FROM memberships WHERE id = ? AND household_id = ? AND role = 'guardian'`)
			.get(req.params.id, c.household.id) as MembershipRow | undefined;
		if (!m) return reply.code(404).send({ error: 'Not found' });
		accounts.prepare('UPDATE memberships SET pin_hash = NULL, pin_length = NULL WHERE id = ?').run(m.id);
		unlockAll(c.household.id);
		return reply.code(204).send();
	});
}
