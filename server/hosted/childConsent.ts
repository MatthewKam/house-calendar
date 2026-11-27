import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomInt } from 'node:crypto';
import type { AccountsDB } from '../accounts.ts';
import { hashPin, pinMatches } from '../auth.ts';
import { CODE_MS, MAX_TRIES, later, now, type ServerOptions, type Sessions } from './session.ts';

// A guardian's consent for their household's children (COPPA's verifiable parental consent, "email plus":
// Sprig keeps children's information only for the family's own use). Docs: docs/coppa.md; the privacy page's
// Children section.
//
// 1. A guardian asks: Sprig emails them the notice (what's kept about children, why, who else handles it, their
//    rights) with a code. 2. They type the code into Sprig: consent is given, noted with their email, and a
//    second email confirms it and says how to take it back. Until then no child can be added (members.ts, a
//    kid's code in household.ts). Taking it back signs the children's devices out and ends their codes.

export function childConsentRoutes(app: FastifyInstance, accounts: AccountsDB, x: Sessions, opts: ServerOptions) {
	const { contextOf, needUser, status } = x;

	/** A guardian on their own account, with the email they sign in with; or a 401/403/400. */
	function guardian(req: FastifyRequest, reply: FastifyReply) {
		const s = needUser(req, reply);
		if (!s) return null;
		const c = contextOf(s);
		if (c.role !== 'guardian' || !c.membership || !c.household) {
			reply.code(403).send({ error: 'Only a guardian can give consent for children' });
			return null;
		}
		const email = (
			accounts.prepare('SELECT email FROM users WHERE id = ?').get(s.user_id) as { email: string | null } | undefined
		)?.email;
		return { membership: c.membership, household: c.household, email: email ?? null };
	}
	const log = (household: string, action: 'given' | 'taken back', email: string | null) =>
		accounts
			.prepare('INSERT INTO child_consent_log (household_id, action, email) VALUES (?, ?, ?)')
			.run(household, action, email);

	// The notice and a code, to the email this guardian signs in with.
	app.post('/api/account/child-consent/start', async (req, reply) => {
		const g = guardian(req, reply);
		if (!g) return;
		if (!opts.sendCode || !g.email)
			return reply.code(400).send({ error: 'Sprig needs an email address for you to send the consent code to' });
		const last = accounts.prepare('SELECT sent_at FROM consent_codes WHERE membership_id = ?').get(g.membership.id) as
			{ sent_at: string } | undefined;
		if (last && Date.now() - Date.parse(last.sent_at) < 60_000)
			return reply.code(429).send({ error: 'A code was just sent. Wait a moment before asking for another.' });
		const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
		accounts
			.prepare(
				`INSERT INTO consent_codes (membership_id, code_hash, sent_at, expires_at, tries) VALUES (?, ?, ?, ?, 0)
      ON CONFLICT (membership_id) DO UPDATE SET code_hash = excluded.code_hash, sent_at = excluded.sent_at, expires_at = excluded.expires_at, tries = 0`,
			)
			.run(g.membership.id, hashPin(code), now(), later(CODE_MS));
		await opts.sendCode(g.email, code, 'consent');
		return { sentTo: g.email };
	});

	// The emailed code: consent given, and confirmed by a second email.
	app.post<{ Body: { code: string } }>(
		'/api/account/child-consent/verify',
		{
			schema: {
				body: {
					type: 'object',
					required: ['code'],
					additionalProperties: false,
					properties: { code: { type: 'string', maxLength: 12 } },
				},
			},
		},
		async (req, reply) => {
			const g = guardian(req, reply);
			if (!g) return;
			const row = accounts.prepare('SELECT * FROM consent_codes WHERE membership_id = ?').get(g.membership.id) as
				{ code_hash: string; expires_at: string; tries: number } | undefined;
			if (!row || row.expires_at < now() || row.tries >= MAX_TRIES)
				return reply.code(401).send({ error: 'That code has expired. Ask for a new one.' });
			if (!pinMatches(req.body.code.replace(/\D/g, ''), row.code_hash)) {
				accounts.prepare('UPDATE consent_codes SET tries = tries + 1 WHERE membership_id = ?').run(g.membership.id);
				return reply.code(401).send({ error: 'Wrong code' });
			}
			accounts.transaction(() => {
				accounts.prepare('DELETE FROM consent_codes WHERE membership_id = ?').run(g.membership.id);
				accounts
					.prepare('UPDATE households SET child_consent_at = ?, child_consent_email = ? WHERE id = ?')
					.run(now(), g.email, g.household.id);
				log(g.household.id, 'given', g.email);
			})();
			// The "plus": a second email confirming it (and how to take it back). Consent stands if it can't be sent.
			if (opts.sendCode && g.email)
				await opts.sendCode(g.email, '', 'consented').catch((err: unknown) => req.log.error({ err }, 'consent email'));
			return status(req);
		},
	);

	// Taken back: the children's devices are signed out and their codes end; no child can be added until a
	// guardian gives it again. What's kept stays until a guardian removes the children (that deletes it).
	app.delete('/api/account/child-consent', async (req, reply) => {
		const g = guardian(req, reply);
		if (!g) return;
		const id = g.household.id;
		accounts.transaction(() => {
			accounts
				.prepare('UPDATE households SET child_consent_at = NULL, child_consent_email = NULL WHERE id = ?')
				.run(id);
			accounts
				.prepare(
					`DELETE FROM sessions WHERE household_id = ? AND kind = 'device'
          AND membership_id IN (SELECT id FROM memberships WHERE household_id = ? AND role = 'kid')`,
				)
				.run(id, id);
			accounts.prepare(`DELETE FROM invites WHERE household_id = ? AND kind = 'kid'`).run(id);
			log(id, 'taken back', g.email);
		})();
		return status(req);
	});
}
