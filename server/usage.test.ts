import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { openAccounts } from './accounts.ts';
import { usageLog, watchUsage } from './usage.ts';

function setup() {
	const accounts = openAccounts(':memory:');
	for (const id of ['h1', 'h2'])
		accounts.prepare(`INSERT INTO households (id, name, db_file, photos_dir) VALUES (?, ?, '', '')`).run(id, id);
	let at = new Date('2026-11-27T10:00:00Z');
	const log = usageLog(accounts, () => at);
	const rows = () => accounts.prepare('SELECT * FROM usage_daily ORDER BY day, household_id, metric').all();
	const session = (hash: string, household: string, kind: string, lastSeen: string) =>
		accounts
			.prepare(`INSERT INTO sessions (token_hash, kind, household_id, label, last_seen) VALUES (?, ?, ?, 'x', ?)`)
			.run(hash, kind, household, lastSeen);
	return { accounts, log, rows, session, setAt: (d: string) => (at = new Date(d)) };
}

describe('the usage log', () => {
	it('counts changes per household per day, written together', () => {
		const { log, rows, setAt } = setup();
		log.count('h1', 'use:POST /api/tasks/:id/done');
		log.count('h1', 'use:POST /api/tasks/:id/done');
		log.count('h2', 'use:POST /api/events');
		expect(rows()).toEqual([]);
		log.flush();
		setAt('2026-11-28T01:00:00Z');
		log.count('h1', 'use:POST /api/tasks/:id/done');
		log.flush();
		expect(rows()).toEqual([
			{ day: '2026-11-27', household_id: 'h1', metric: 'use:POST /api/tasks/:id/done', count: 2 },
			{ day: '2026-11-27', household_id: 'h2', metric: 'use:POST /api/events', count: 1 },
			{ day: '2026-11-28', household_id: 'h1', metric: 'use:POST /api/tasks/:id/done', count: 1 },
		]);
	});

	it("counts each day's active devices by kind, and a sign-out doesn't lower it", () => {
		const { accounts, log, rows, session } = setup();
		session('a', 'h1', 'user', '2026-11-27T09:00:00.000Z');
		session('b', 'h1', 'device', '2026-11-27T09:30:00.000Z');
		session('c', 'h1', 'user', '2026-11-26T22:00:00.000Z');
		log.flush();
		accounts.prepare(`DELETE FROM sessions WHERE token_hash = 'a'`).run();
		log.flush();
		expect(rows()).toEqual([
			{ day: '2026-11-27', household_id: 'h1', metric: 'active:device', count: 1 },
			{ day: '2026-11-27', household_id: 'h1', metric: 'active:user', count: 1 },
		]);
	});

	it("drops a deleted household's counts, and days older than 13 months", () => {
		const { accounts, log, rows, setAt } = setup();
		setAt('2025-10-01T10:00:00Z');
		log.count('h1', 'use:POST /api/events');
		log.flush();
		setAt('2026-11-27T10:00:00Z');
		log.count('h1', 'use:POST /api/events');
		log.count('h2', 'use:POST /api/events');
		accounts.prepare(`DELETE FROM households WHERE id = 'h2'`).run();
		log.flush();
		expect(log.forgetOld()).toBe(1);
		expect(rows()).toEqual([{ day: '2026-11-27', household_id: 'h1', metric: 'use:POST /api/events', count: 1 }]);
	});

	it('counts changes that went through, by route pattern, not looks or refusals', async () => {
		const got: string[] = [];
		const app = Fastify();
		watchUsage(app, (m) => got.push(m));
		app.get('/api/tasks', async () => []);
		app.post('/api/tasks/:id/done', async (req, reply) =>
			(req.params as { id: string }).id === 'no' ? reply.code(403).send({}) : {},
		);
		await app.inject('/api/tasks');
		await app.inject({ method: 'POST', url: '/api/tasks/42/done' });
		await app.inject({ method: 'POST', url: '/api/tasks/no/done' });
		await app.inject({ method: 'POST', url: '/api/nowhere' });
		expect(got).toEqual(['use:POST /api/tasks/:id/done']);
	});
});
