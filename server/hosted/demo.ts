import type { FastifyInstance, HTTPMethods } from 'fastify';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AccountsDB, SessionRow } from '../accounts.ts';
import type { HouseholdRegistry } from '../households.ts';
import { hashPin } from '../auth.ts';
import { fillDemo, type Call } from '../demo.ts';
import { deleteUser } from './deleteAccount.ts';
import { COOKIE, DEMO_PIN, later, now, windowLimit, type ServerOptions, type Sessions } from './session.ts';

// The site's demo: "Try the demo" on the sign-in screen makes the visitor their own copy of the Rivera
// family (server/demo.ts), with this week's dates, no email needed. They're Alex, a guardian, so all of it
// can be tried. It's deleted after a day, or when they choose to make their own family. Anything that costs
// (Claude, uploads), reaches outside (calendar connections, alerts) or brings other people in (invites,
// joining) is off.

const DEMO_MS = 24 * 60 * 60_000;
/** Demos at once: each is a household on the server's disk. */
export const DEMO_MAX = 200;
/** Where the family's week is laid out when the visitor's own time zone isn't known. */
const ZONE = 'America/Los_Angeles';

/** What's off in the demo, as METHOD and address. */
const OFF: [string, RegExp][] = [
	['POST', /^\/api\/capture$/],
	['POST', /^\/api\/recipes\/(read|ideas|surprise)$/],
	['POST', /^\/api\/photos(\/video)?$/],
	['POST', /^\/api\/recipes\/[^/]+\/images$/],
	['POST', /^\/api\/connections\/icloud$/],
	['PUT', /^\/api\/phone-calendars\/[^/]+$/],
	['POST', /^\/api\/push(\/test)?$/],
	['POST', /^\/api\/account\/(households|join|invites)$/],
	// The PIN stays the one the demo shows.
	['PUT', /^\/api\/account\/pin$/],
	['*', /^\/api\/account\/google\//],
];
export const DEMO_OFF = "That's not in the demo. Make your own family to use it.";

/** A demo's account (and so its household) is deleted at this time. */
const demoUntil = (accounts: AccountsDB, s: SessionRow | undefined) =>
	s?.kind === 'user'
		? ((
				accounts.prepare('SELECT demo_until FROM users WHERE id = ?').get(s.user_id) as
					{ demo_until: string | null } | undefined
			)?.demo_until ?? null)
		: null;

/** This call is one the demo doesn't do, from a demo. */
export function demoBlocks(accounts: AccountsDB, method: string, path: string, s: () => SessionRow | undefined) {
	return OFF.some(([m, re]) => (m === '*' || m === method) && re.test(path)) && !!demoUntil(accounts, s());
}

const realZone = (tz: string) => {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
};

export function demoRoutes(
	app: FastifyInstance,
	accounts: AccountsDB,
	households: HouseholdRegistry,
	x: Sessions,
	opts: ServerOptions,
) {
	const { sessionOf, householdById, startSession, addMember, status, started } = x;
	const perDevice = windowLimit(5, 60 * 60_000);

	/** Demos past their day: deleted, household and all. */
	async function clearDemos() {
		const over = accounts.prepare('SELECT id FROM users WHERE demo_until < ?').all(now()) as { id: string }[];
		for (const u of over) await deleteUser(accounts, households, x, opts.dataDir, u.id);
	}

	app.post<{ Body: { timeZone?: string } }>(
		'/api/account/demo',
		{
			schema: {
				body: {
					type: 'object',
					additionalProperties: false,
					properties: { timeZone: { type: 'string', maxLength: 64 } },
				},
			},
		},
		async (req, reply) => {
			await clearDemos();
			const live = (
				accounts.prepare('SELECT COUNT(*) n FROM users WHERE demo_until IS NOT NULL').get() as { n: number }
			).n;
			if (live >= DEMO_MAX)
				return reply.code(503).send({ error: 'Lots of people are trying the demo right now. Try again in a while.' });
			if (!perDevice.take(req.ip)) return reply.code(429).send({ error: 'Too many demos. Try again in a while.' });
			const zone = req.body?.timeZone && realZone(req.body.timeZone) ? req.body.timeZone : ZONE;

			// Alex's account, and the household they hold, as making one would (hosted/household.ts).
			const userId = randomUUID();
			const id = randomUUID();
			const dir = join('households', id);
			accounts.transaction(() => {
				accounts
					.prepare('INSERT INTO users (id, name, email, demo_until) VALUES (?, ?, NULL, ?)')
					.run(userId, 'Alex', later(DEMO_MS));
				accounts
					.prepare('INSERT INTO households (id, name, db_file, photos_dir) VALUES (?, ?, ?, ?)')
					.run(id, 'The Rivera family', join(dir, 'calendar.db'), join(dir, 'photos'));
			})();
			const h = householdById(id)!;
			try {
				const memberId = await addMember(h, 'Alex');
				const membershipId = randomUUID();
				accounts.transaction(() => {
					accounts
						.prepare(
							`INSERT INTO memberships (id, household_id, member_id, user_id, role, pin_hash, pin_length)
          VALUES (?, ?, ?, ?, 'guardian', ?, ?)`,
						)
						.run(membershipId, id, memberId, userId, hashPin(DEMO_PIN), DEMO_PIN.length);
					accounts.prepare('UPDATE households SET holder_id = ? WHERE id = ?').run(membershipId, id);
				})();

				// The family's week, through the household's own API (as App Review's script does over the network).
				// Quietly: a demo is a couple of hundred calls, not worth a log line each.
				const { app: home } = await households.get(h);
				const level = home.log.level;
				home.log.level = 'warn';
				const call: Call = async (method, url, body) => {
					const res = await home.inject({ method: method as HTTPMethods, url, payload: body as object });
					if (res.statusCode >= 400) throw new Error(`demo: ${method} ${url}: ${res.statusCode} ${res.body}`);
					return (res.statusCode === 204 ? undefined : res.json()) as never;
				};
				try {
					await fillDemo(call, memberId, zone);
				} finally {
					home.log.level = level;
				}
			} catch (err) {
				await deleteUser(accounts, households, x, opts.dataDir, userId);
				throw err;
			}
			startSession(req, reply, { kind: 'user', user_id: userId, household_id: id });
			reply.code(201);
			return status(req);
		},
	);

	// "Make your own family": the demo goes now, and this device is back at the sign-in screen.
	app.delete('/api/account/demo', async (req, reply) => {
		const s = sessionOf(req);
		if (!s || !demoUntil(accounts, s)) return reply.code(404).send({ error: 'Not in a demo' });
		await deleteUser(accounts, households, x, opts.dataDir, s.user_id!);
		started.delete(req.raw);
		reply.header('set-cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
		return reply.code(204).send();
	});

	// Ended demos are cleared every 10 minutes too, not only when someone starts one.
	const run = () => void clearDemos().catch((err) => app.log.error(err, 'clearing ended demos'));
	run();
	const timer = setInterval(run, 10 * 60_000);
	timer.unref();
	app.addHook('onClose', async () => clearInterval(timer));
}
