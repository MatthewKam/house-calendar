import type { FastifyInstance } from 'fastify';
import { rmSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fromStored, type AccountsDB, type HouseholdRow, type MembershipRow } from '../accounts.ts';
import type { HouseholdRegistry } from '../households.ts';
import { COOKIE, type ServerOptions, type Sessions } from './session.ts';

// Deleting your account (the App Store asks that it can be done in the app): your sign-ins, every
// device signed in as you, and your calendar connections go. In a household you hold with no co-holder
// (or are the last guardian of), the household goes too, for everyone: its calendar, tasks, jars and
// photos. With a co-holder, it's theirs to hold from then on. Elsewhere
// you leave it: the family keeps you in its list (what they've put in is theirs), but no one signs in
// as you. A kid with devices added by code keeps those.

/** What deleting this user's account does to each of their households. */
export function deletionPlan(
	accounts: AccountsDB,
	{ holderOf, holdersOf }: Pick<Sessions, 'holderOf' | 'holdersOf'>,
	userId: string,
) {
	const ships = accounts.prepare('SELECT * FROM memberships WHERE user_id = ?').all(userId) as MembershipRow[];
	const guardians = (id: string) =>
		(
			accounts.prepare(`SELECT COUNT(*) n FROM memberships WHERE household_id = ? AND role = 'guardian'`).get(id) as {
				n: number;
			}
		).n;
	return ships.map((m) => {
		const held = holderOf(m.household_id) === m.id;
		// The co-holder who holds it next, when it's theirs.
		const heir = held ? [...holdersOf(m.household_id)].find((id) => id !== m.id) : undefined;
		return {
			membership: m,
			household: accounts.prepare('SELECT * FROM households WHERE id = ?').get(m.household_id) as HouseholdRow,
			heir,
			deleted: (held && !heir) || (m.role === 'guardian' && guardians(m.household_id) === 1),
		};
	});
}

export function deleteAccountRoutes(
	app: FastifyInstance,
	accounts: AccountsDB,
	households: HouseholdRegistry,
	x: Sessions,
	opts: ServerOptions,
) {
	const { needUser, started } = x;

	// For the question before deleting: which households go, and which are only left.
	app.get('/api/account/delete', async (req, reply) => {
		const s = needUser(req, reply);
		if (!s) return;
		return deletionPlan(accounts, x, s.user_id!).map((p) => ({
			household: p.household.name,
			deleted: p.deleted,
		}));
	});

	app.delete('/api/account/delete', async (req, reply) => {
		const s = needUser(req, reply);
		if (!s) return;
		if (s.wall_mode) return reply.code(403).send({ error: 'Turn wall mode off first' });
		const userId = s.user_id!;
		const plan = deletionPlan(accounts, x, userId);

		// Their calendar connections and alerts, in the households they're leaving (the rest go whole).
		for (const p of plan.filter((p) => !p.deleted)) {
			const h = await households.get(p.household);
			await h.disconnect?.(p.membership.member_id);
			h.db.prepare('DELETE FROM push_devices WHERE member_id = ?').run(p.membership.member_id);
		}
		const gone = plan.filter((p) => p.deleted).map((p) => p.household);
		for (const h of gone) await households.drop(h.id);

		const user = accounts.prepare('SELECT email FROM users WHERE id = ?').get(userId) as
			{ email: string | null } | undefined;
		accounts.transaction(() => {
			for (const p of plan) {
				if (p.deleted) {
					// Other people's own devices stay signed in, out of it; its kids' devices and walls go with it.
					accounts
						.prepare(
							`UPDATE sessions SET household_id = NULL, parent_until = NULL WHERE kind = 'user' AND household_id = ?`,
						)
						.run(p.household.id);
					accounts.prepare('DELETE FROM households WHERE id = ?').run(p.household.id);
					// Its backups go too, within the 30 days the privacy page promises (server/backups.ts).
					accounts.prepare('INSERT OR IGNORE INTO gone_backups (db_file) VALUES (?)').run(p.household.db_file);
				} else if (p.membership.role === 'kid') {
					accounts.prepare('UPDATE memberships SET user_id = NULL WHERE id = ?').run(p.membership.id);
				} else {
					if (p.heir) accounts.prepare('UPDATE households SET holder_id = ? WHERE id = ?').run(p.heir, p.household.id);
					accounts.prepare('DELETE FROM memberships WHERE id = ?').run(p.membership.id);
				}
			}
			const emails = (
				accounts.prepare('SELECT email FROM identities WHERE user_id = ? AND email IS NOT NULL').all(userId) as {
					email: string;
				}[]
			).map((r) => r.email);
			for (const e of new Set([user?.email, ...emails]))
				if (e) accounts.prepare('DELETE FROM email_codes WHERE email = ?').run(e.toLowerCase());
			// Their sign-ins (identities) and sessions go with them.
			accounts.prepare('DELETE FROM users WHERE id = ?').run(userId);
		})();

		// The households' files: a household's own folder (data/households/<id>), or for the one from before
		// accounts, its database and photos.
		for (const h of gone) {
			const db = fromStored(opts.dataDir, h.db_file);
			const own = dirname(db);
			if (own.startsWith(resolve(opts.dataDir, 'households') + sep)) rmSync(own, { recursive: true, force: true });
			else {
				for (const f of [db, `${db}-wal`, `${db}-shm`]) rmSync(f, { force: true });
				rmSync(fromStored(opts.dataDir, h.photos_dir), { recursive: true, force: true });
			}
		}

		started.delete(req.raw);
		reply.header('set-cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
		return reply.code(204).send();
	});
}
