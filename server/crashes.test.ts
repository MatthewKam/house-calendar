import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { openAccounts } from './accounts.ts';
import { crashLog, fingerprint, scrub, watchServerErrors } from './crashes.ts';

describe('crash reports', () => {
	it('keep no emails or secret-looking strings, and cut each part short', () => {
		expect(scrub('no user pat.kim+1@gmail.com here', 100)).toBe('no user <email> here');
		expect(scrub(`token ${'a'.repeat(40)} end`, 100)).toBe('token … end');
		expect(scrub('x '.repeat(50), 10)).toBe('x '.repeat(5));
	});

	it('count the same crash as one, whatever its numbers and ids', () => {
		const a = fingerprint({
			source: 'app',
			place: 'Today',
			message: 'Error: task 12 (3f2b1c4d-1111-2222-3333-444455556666)',
		});
		const b = fingerprint({
			source: 'app',
			place: 'Today',
			message: 'Error: task 7 (aaaaaaaa-1111-2222-3333-444455556666)',
		});
		expect(a).toBe(b);
		expect(fingerprint({ source: 'app', place: 'Calendar', message: 'Error: task 12' })).not.toBe(a);
	});

	it('go 90 days after they were last seen', () => {
		const accounts = openAccounts(':memory:');
		let at = new Date('2026-01-01T00:00:00Z');
		const log = crashLog(accounts, () => at);
		log.record({ source: 'app', message: 'Error: old' });
		at = new Date('2026-03-01T00:00:00Z');
		log.record({ source: 'app', message: 'Error: newer' });
		at = new Date('2026-04-15T00:00:00Z');
		expect(log.forgetOld()).toBe(1);
		expect(accounts.prepare('SELECT message FROM crashes').all()).toEqual([{ message: 'Error: newer' }]);
	});

	it("report the server's own errors by route, not a caller's refusals", async () => {
		const got: { message: string; route?: string }[] = [];
		const app = Fastify();
		watchServerErrors(app, (err, where) => got.push({ message: err.message, route: where.route }));
		app.get('/api/tasks/:id', async (req) => {
			if ((req.params as { id: string }).id === 'bad') throw Object.assign(new Error('Not yours'), { statusCode: 403 });
			throw new Error('database is locked');
		});
		expect((await app.inject('/api/tasks/42')).statusCode).toBe(500);
		expect((await app.inject('/api/tasks/bad')).statusCode).toBe(403);
		expect(got).toEqual([{ message: 'database is locked', route: '/api/tasks/:id' }]);
	});
});
