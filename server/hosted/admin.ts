import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AccountsDB } from '../accounts.ts';
import type { AdminOverview, HouseholdTag } from '../../shared/admin.ts';
import type { ServerOptions, Sessions } from './session.ts';

// The admin page's data (web/src/components/admin): for the one admin, ADMIN_EMAIL, signed in on their own
// account. To anyone else it isn't there at all (404, as for any address that doesn't exist). Households by
// their number only, tagged so real families stand apart from the admin's own, their test accounts
// (OWN_EMAILS), App Review's and the site's demos.

/** How far back the charts go. */
const DAYS = 60;
/** How far back "which features get used" goes. */
const USE_DAYS = 30;

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => dayOf(new Date(Date.now() - n * 86_400_000));

export function adminRoutes(app: FastifyInstance, accounts: AccountsDB, x: Sessions, opts: ServerOptions) {
	const admin = opts.admin?.email.trim().toLowerCase();
	const own = new Set((opts.admin?.own ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
	const review = opts.review?.email.toLowerCase();

	/** The emails an account signs in with. */
	const emailsOf = (userId: string) =>
		(
			accounts
				.prepare('SELECT email FROM users WHERE id = ? UNION SELECT email FROM identities WHERE user_id = ?')
				.all(userId, userId) as { email: string | null }[]
		)
			.map((r) => r.email?.toLowerCase())
			.filter((e): e is string => !!e);

	/** The admin, on their own account: only then. */
	function isAdmin(req: FastifyRequest) {
		const s = x.sessionOf(req);
		return !!admin && s?.kind === 'user' && !!s.user_id && emailsOf(s.user_id).includes(admin);
	}

	function overview(): Omit<AdminOverview, 'health'> {
		const households = accounts
			.prepare('SELECT rowid AS number, id, legacy, created_at FROM households ORDER BY rowid')
			.all() as { number: number; id: string; legacy: number; created_at: string }[];
		const numberOf = new Map(households.map((h) => [h.id, h.number]));

		// Each household's guardians' accounts, for its tag.
		const guardians = accounts
			.prepare(
				`SELECT m.household_id, u.id AS user_id, u.demo_until FROM memberships m
				 JOIN users u ON u.id = m.user_id WHERE m.role = 'guardian'`,
			)
			.all() as { household_id: string; user_id: string; demo_until: string | null }[];
		const tags = new Map<string, HouseholdTag>();
		const rank: HouseholdTag[] = ['you', 'test', 'review', 'demo'];
		const tagAs = (id: string, tag: HouseholdTag) => {
			const was = tags.get(id);
			if (!was || rank.indexOf(tag) < rank.indexOf(was)) tags.set(id, tag);
		};
		for (const h of households) if (h.legacy) tagAs(h.id, 'you');
		for (const g of guardians) {
			if (g.demo_until) tagAs(g.household_id, 'demo');
			for (const e of emailsOf(g.user_id)) {
				if (e === admin) tagAs(g.household_id, 'you');
				else if (own.has(e)) tagAs(g.household_id, 'test');
				else if (e === review) tagAs(g.household_id, 'review');
			}
		}
		const tagOf = (id: string) => tags.get(id) ?? null;

		const people = accounts
			.prepare('SELECT household_id, role, COUNT(*) AS n FROM memberships GROUP BY household_id, role')
			.all() as { household_id: string; role: 'guardian' | 'kid'; n: number }[];
		const devices = accounts
			.prepare(
				`SELECT household_id, kind, COUNT(*) AS n, MAX(last_seen) AS last FROM sessions
				 WHERE household_id IS NOT NULL GROUP BY household_id, kind`,
			)
			.all() as { household_id: string; kind: 'user' | 'device' | 'wall'; n: number; last: string }[];

		const from = daysAgo(DAYS - 1);
		const usage = accounts
			.prepare('SELECT day, household_id, metric, count FROM usage_daily WHERE day >= ?')
			.all(from) as { day: string; household_id: string; metric: string; count: number }[];
		const days = new Map<string, AdminOverview['days'][number]>();
		const uses = new Map<string, AdminOverview['uses'][number]>();
		const useFrom = daysAgo(USE_DAYS - 1);
		for (const u of usage) {
			const household = numberOf.get(u.household_id);
			if (household === undefined) continue;
			const key = `${u.day}\n${household}`;
			let d = days.get(key);
			if (!d) days.set(key, (d = { day: u.day, household, changes: 0, active: { user: 0, device: 0, wall: 0 } }));
			if (u.metric.startsWith('active:')) {
				const kind = u.metric.slice(7) as keyof typeof d.active;
				if (kind in d.active) d.active[kind] = u.count;
			} else if (u.metric.startsWith('use:')) {
				d.changes += u.count;
				if (u.day >= useFrom) {
					const route = u.metric.slice(4);
					const k = `${route}\n${household}`;
					const was = uses.get(k);
					if (was) was.count += u.count;
					else uses.set(k, { route, household, count: u.count });
				}
			}
		}

		const signUps = (
			accounts
				.prepare(
					`SELECT u.created_at, (SELECT m.household_id FROM memberships m WHERE m.user_id = u.id
					   ORDER BY m.created_at LIMIT 1) AS household_id
					 FROM users u WHERE u.demo_until IS NULL AND u.created_at >= ?`,
				)
				.all(from) as { created_at: string; household_id: string | null }[]
		).map((u) => ({ day: u.created_at.slice(0, 10), tag: u.household_id ? tagOf(u.household_id) : null }));

		const seen = accounts.prepare('SELECT fingerprint, household_id FROM crash_households').all() as {
			fingerprint: string;
			household_id: string;
		}[];
		const crashes = (
			accounts.prepare('SELECT * FROM crashes ORDER BY last_at DESC').all() as {
				fingerprint: string;
				source: 'app' | 'server';
				message: string;
				stack: string | null;
				place: string | null;
				platform: string | null;
				version: string | null;
				device: string | null;
				count: number;
				first_at: string;
				last_at: string;
			}[]
		).map((c) => ({
			id: c.fingerprint,
			source: c.source,
			message: c.message,
			stack: c.stack,
			place: c.place,
			platform: c.platform,
			version: c.version,
			device: c.device,
			count: c.count,
			firstAt: c.first_at,
			lastAt: c.last_at,
			households: seen
				.filter((s) => s.fingerprint === c.fingerprint)
				.map((s) => numberOf.get(s.household_id))
				.filter((n): n is number => n !== undefined),
		}));

		return {
			from,
			to: dayOf(new Date()),
			households: households.map((h) => {
				const count = (role: string) => people.find((p) => p.household_id === h.id && p.role === role)?.n ?? 0;
				const mine = devices.filter((d) => d.household_id === h.id);
				const kind = (k: string) => mine.find((d) => d.kind === k)?.n ?? 0;
				return {
					number: h.number,
					tag: tagOf(h.id),
					createdAt: h.created_at,
					guardians: count('guardian'),
					kids: count('kid'),
					devices: { user: kind('user'), device: kind('device'), wall: kind('wall') },
					lastActive: mine.reduce<string | null>((a, d) => (a && a > d.last ? a : d.last), null),
				};
			}),
			signUps,
			days: [...days.values()],
			uses: [...uses.values()],
			crashes,
		};
	}

	app.get('/api/admin/overview', async (req, reply): Promise<AdminOverview | undefined> => {
		if (!isAdmin(req)) return reply.code(404).send({ error: 'Not found' });
		reply.header('cache-control', 'no-store');
		return { ...overview(), health: (await opts.health?.snapshot()) ?? null };
	});
}
