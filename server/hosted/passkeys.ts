import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type AuthenticatorTransport,
	type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { AccountsDB } from '../accounts.ts';
import { deviceLabel } from '../auth.ts';
import type { ServerOptions, Sessions } from './session.ts';

// Passkeys: signing in with Face ID, Touch ID or a phone's screen lock instead of an emailed code.
// A signed-in person saves one (the device keeps it, in iCloud Keychain or Google Password Manager);
// later, signed out, the device signs a one-time challenge with it and the server checks the
// signature against the public half kept here. The checks themselves are @simplewebauthn/server's.

/** Who keeps a passkey, from the code its maker sends (AAGUID); others are named by the device. */
const PROVIDERS: Record<string, string> = {
	'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
	'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'iCloud Keychain',
	'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
	'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
	'08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
	'9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
	'6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
	'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
	'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
	'531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
};

/** A challenge is good for this long, and once. */
const CHALLENGE_MS = 5 * 60_000;
/** At most this many waiting at once (each sign-in screen asks for one). */
const MAX_WAITING = 10_000;

interface PasskeyRow {
	id: string;
	user_id: string;
	public_key: Buffer;
	counter: number;
	transports: string | null;
	provider: string | null;
	device: string | null;
	created_at: string;
	last_used: string | null;
}

export interface Passkey {
	id: string;
	/** Who keeps it ("iCloud Keychain"), when known. */
	provider: string | null;
	/** The device it was saved on ("iPhone · Safari"). */
	device: string | null;
	createdAt: string;
	lastUsed: string | null;
}

const summary = (r: PasskeyRow): Passkey => ({
	id: r.id,
	provider: r.provider,
	device: r.device,
	createdAt: r.created_at,
	lastUsed: r.last_used,
});

/** The browser's answer: an object the library reads; only its size is limited here. */
const RESPONSE = { type: 'object', additionalProperties: true } as const;

export function passkeyRoutes(
	app: FastifyInstance,
	accounts: AccountsDB,
	{ needUser }: Sessions,
	opts: ServerOptions,
	signInUser: (req: FastifyRequest, reply: FastifyReply, userId: string) => unknown,
) {
	const config = opts.passkeys;
	if (!config) return;
	const { rpID } = config;
	/** The page asking (its Origin), checked by the library against this list. */
	const origins = (req: FastifyRequest) => {
		if (config.origins) return config.origins;
		const origin = req.headers.origin ?? '';
		return /^http:\/\/localhost(:\d+)?$/.test(origin) ? [origin] : [];
	};

	// One-time challenges, by what they're for: a person saving a passkey, or a sign-in screen.
	const waiting = new Map<string, { challenge: string; until: number }>();
	function keep(key: string, challenge: string) {
		const now = Date.now();
		if (waiting.size >= MAX_WAITING) for (const [k, w] of waiting) if (w.until <= now) waiting.delete(k);
		if (waiting.size >= MAX_WAITING) return false;
		waiting.set(key, { challenge, until: now + CHALLENGE_MS });
		return true;
	}
	/** The challenge for `key`, used up: a second try needs a new one. */
	function take(key: string) {
		const w = waiting.get(key);
		waiting.delete(key);
		return w && w.until > Date.now() ? w.challenge : null;
	}

	const ownedBy = (userId: string) =>
		accounts.prepare('SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at').all(userId) as PasskeyRow[];

	// ---- Saving one, signed in ----------------------------------------------

	app.get('/api/account/passkeys', async (req, reply) => {
		const s = needUser(req, reply);
		if (!s) return;
		return ownedBy(s.user_id!).map(summary);
	});

	app.post('/api/account/passkeys/register/options', async (req, reply) => {
		const s = needUser(req, reply);
		if (!s) return;
		const user = accounts.prepare('SELECT name, email, demo_until FROM users WHERE id = ?').get(s.user_id) as
			{ name: string; email: string | null; demo_until: string | null } | undefined;
		if (!user) return reply.code(401).send({ error: 'Sign in first' });
		if (user.demo_until) return reply.code(403).send({ error: "The demo can't save a passkey" });
		const options = await generateRegistrationOptions({
			rpName: 'Sprig',
			rpID,
			userName: user.email ?? user.name,
			userDisplayName: user.name,
			userID: new TextEncoder().encode(s.user_id!),
			attestationType: 'none',
			// Kept on the device and found by it, so signing in needs no email typed first.
			authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
			excludeCredentials: ownedBy(s.user_id!).map((p) => ({
				id: p.id,
				transports: p.transports ? (JSON.parse(p.transports) as AuthenticatorTransport[]) : undefined,
			})),
		});
		if (!keep(`save:${s.token_hash}`, options.challenge))
			return reply.code(503).send({ error: 'Too busy right now. Try again in a minute.' });
		return options;
	});

	app.post<{ Body: { response: RegistrationResponseJSON } }>(
		'/api/account/passkeys/register/verify',
		{
			schema: {
				body: {
					type: 'object',
					required: ['response'],
					additionalProperties: false,
					properties: { response: RESPONSE },
				},
			},
		},
		async (req, reply) => {
			const s = needUser(req, reply);
			if (!s) return;
			const challenge = take(`save:${s.token_hash}`);
			if (!challenge) return reply.code(400).send({ error: 'That took too long. Try again.' });
			let info;
			try {
				const result = await verifyRegistrationResponse({
					response: req.body.response,
					expectedChallenge: challenge,
					expectedOrigin: origins(req),
					expectedRPID: rpID,
					requireUserVerification: false,
				});
				if (!result.verified) throw new Error('not verified');
				info = result.registrationInfo;
			} catch (err) {
				req.log.warn({ err }, 'passkey not saved');
				return reply.code(400).send({ error: "That passkey couldn't be saved. Try again." });
			}
			const { credential, aaguid } = info;
			accounts
				.prepare(
					`INSERT INTO passkeys (id, user_id, public_key, counter, transports, provider, device)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
				)
				.run(
					credential.id,
					s.user_id,
					Buffer.from(credential.publicKey),
					credential.counter,
					credential.transports ? JSON.stringify(credential.transports) : null,
					PROVIDERS[aaguid] ?? null,
					deviceLabel(req.headers['user-agent']),
				);
			const row = accounts
				.prepare('SELECT * FROM passkeys WHERE id = ? AND user_id = ?')
				.get(credential.id, s.user_id) as PasskeyRow | undefined;
			if (!row) return reply.code(409).send({ error: 'That passkey belongs to another account' });
			return summary(row);
		},
	);

	app.delete<{ Params: { id: string } }>('/api/account/passkeys/:id', async (req, reply) => {
		const s = needUser(req, reply);
		if (!s) return;
		const gone = accounts.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').run(req.params.id, s.user_id);
		return gone.changes ? reply.code(204).send() : reply.code(404).send({ error: 'Not found' });
	});

	// ---- Signing in with one, signed out --------------------------------------

	app.post('/api/account/passkeys/signin/options', async (_req, reply) => {
		// No list of passkeys: the device offers the ones it has for this site.
		const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
		const id = randomUUID();
		if (!keep(`signin:${id}`, options.challenge))
			return reply.code(503).send({ error: 'Too busy right now. Try again in a minute.' });
		return { id, options };
	});

	app.post<{ Body: { id: string; response: AuthenticationResponseJSON } }>(
		'/api/account/passkeys/signin/verify',
		{
			schema: {
				body: {
					type: 'object',
					required: ['id', 'response'],
					additionalProperties: false,
					properties: { id: { type: 'string', maxLength: 64 }, response: RESPONSE },
				},
			},
		},
		async (req, reply) => {
			const challenge = take(`signin:${req.body.id}`);
			if (!challenge) return reply.code(400).send({ error: 'That took too long. Try again.' });
			const credentialId = String((req.body.response as { id?: unknown }).id ?? '');
			const row = accounts.prepare('SELECT * FROM passkeys WHERE id = ?').get(credentialId) as PasskeyRow | undefined;
			if (!row)
				return reply
					.code(401)
					.send({ error: "Sprig doesn't know this passkey (it may have been removed). Sign in another way." });
			try {
				const { verified, authenticationInfo } = await verifyAuthenticationResponse({
					response: req.body.response,
					expectedChallenge: challenge,
					expectedOrigin: origins(req),
					expectedRPID: rpID,
					credential: {
						id: row.id,
						publicKey: new Uint8Array(row.public_key),
						counter: row.counter,
						transports: row.transports ? (JSON.parse(row.transports) as AuthenticatorTransport[]) : undefined,
					},
					requireUserVerification: false,
				});
				if (!verified) throw new Error('not verified');
				accounts
					.prepare('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?')
					.run(authenticationInfo.newCounter, new Date().toISOString(), row.id);
			} catch (err) {
				req.log.warn({ err }, 'passkey sign-in refused');
				return reply.code(401).send({ error: 'That sign-in didn’t work. Try again.' });
			}
			return signInUser(req, reply, row.user_id);
		},
	);
}
