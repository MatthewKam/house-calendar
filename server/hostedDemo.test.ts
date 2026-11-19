import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import inject from 'light-my-request';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { openAccounts, type AccountsDB } from './accounts.ts';
import { householdRegistry } from './households.ts';
import { buildServer } from './hosted.ts';
import { DEMO_MAX } from './hosted/demo.ts';

// The site's demo (hosted/demo.ts): a made-up family per visitor, through the front server.
let dir: string;
let accounts: AccountsDB;
let server: ReturnType<typeof buildServer>;
const codes = new Map<string, string>();

/** A device: keeps its cookie between calls, like a browser. */
function device() {
	let cookie = '';
	const call = async (method: string, url: string, payload?: object) => {
		const res = await inject(server.handle, {
			method: method as 'GET',
			url,
			payload,
			headers: cookie ? { cookie } : {},
		});
		const set = res.headers['set-cookie'];
		if (set) cookie = String(set).split(';')[0];
		return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
	};
	return {
		get: (url: string) => call('GET', url),
		post: (url: string, payload: object = {}) => call('POST', url, payload),
		put: (url: string, payload: object) => call('PUT', url, payload),
		del: (url: string) => call('DELETE', url),
		async signIn(email: string) {
			await call('POST', '/api/account/email/start', { email });
			return call('POST', '/api/account/email/verify', { email, code: codes.get(email)! });
		},
	};
}

beforeEach(async () => {
	dir = mkdtempSync(join(tmpdir(), 'household-'));
	accounts = openAccounts(':memory:');
	const households = householdRegistry((h) => {
		const db = openDb(resolve(dir, h.db_file));
		const app = buildApp(db, { push: { publicKey: 'key', send: async () => {} } });
		return {
			app,
			db,
			close: async () => {
				await app.close();
				db.close();
			},
		};
	});
	server = buildServer(accounts, households, {
		dataDir: dir,
		logger: false,
		sendCode: async (email, code) => void codes.set(email, code),
	});
	await server.app.ready();
});
afterEach(async () => {
	await server.close();
	rmSync(dir, { recursive: true, force: true });
});

const demoHouseholds = () => (existsSync(join(dir, 'households')) ? readdirSync(join(dir, 'households')) : []);

describe('the demo', () => {
	it('makes a visitor their own Rivera family, as its guardian, for a day', async () => {
		const visitor = device();
		const started = await visitor.post('/api/account/demo', { timeZone: 'Europe/London' });
		expect(started.status).toBe(201);
		expect(started.body).toMatchObject({
			signedIn: true,
			household: { name: 'The Rivera family' },
			role: 'guardian',
			parent: true,
			me: { name: 'Alex' },
			demo: { pin: '1234' },
		});
		const left = Date.parse(started.body.demo.until) - Date.now();
		expect(left).toBeGreaterThan(23.9 * 3600_000);
		expect(left).toBeLessThanOrEqual(24 * 3600_000);

		const members = await visitor.get('/api/members');
		expect(members.body.map((m: { name: string }) => m.name)).toEqual(['Alex', 'Sam', 'Mia', 'Leo']);
		expect((await visitor.get('/api/tasks')).body.length).toBeGreaterThan(0);
		expect((await visitor.get('/api/recipes')).body.length).toBe(3);

		// Each visitor has their own copy.
		const other = device();
		const theirs = await other.post('/api/account/demo', {});
		expect(theirs.body.household.id).not.toBe(started.body.household.id);
		expect(demoHouseholds()).toHaveLength(2);
	});

	it('keeps out what costs, reaches outside or brings people in, and only in a demo', async () => {
		const visitor = device();
		await visitor.post('/api/account/demo', {});
		for (const [method, url] of [
			['POST', '/api/account/invites'],
			['POST', '/api/account/households'],
			['POST', '/api/account/join'],
			['POST', '/api/capture'],
			['POST', '/api/recipes/read'],
			['POST', '/api/photos'],
			['POST', '/api/connections/icloud'],
			['POST', '/api/push'],
			['GET', '/api/account/google/connect'],
			['PUT', '/api/account/pin'],
		] as const) {
			const res = await (method === 'GET'
				? visitor.get(url)
				: method === 'PUT'
					? visitor.put(url, {})
					: visitor.post(url, {}));
			expect(res, `${method} ${url}`).toMatchObject({ status: 403, body: { demo: true } });
		}
		// Everything else works as it would for anyone.
		const ev = await visitor.post('/api/events', {
			title: 'Park',
			allDay: false,
			start: '2099-01-01T10:00:00.000Z',
			end: '2099-01-01T11:00:00.000Z',
			memberIds: [],
		});
		expect(ev.status).toBe(201);

		// A family of their own isn't held back.
		const parent = device();
		await parent.signIn('pat@example.com');
		await parent.post('/api/account/households', { name: 'The Kims', yourName: 'Pat' });
		expect((await parent.post('/api/account/invites', { kind: 'guardian', name: 'Sam' })).status).toBe(201);
	});

	it('is deleted, household and all, when the visitor makes their own family', async () => {
		const visitor = device();
		await visitor.post('/api/account/demo', {});
		expect(demoHouseholds()).toHaveLength(1);
		expect((await visitor.del('/api/account/demo')).status).toBe(204);
		expect((await visitor.get('/api/auth/status')).body).toEqual({ signedIn: false });
		expect(demoHouseholds()).toHaveLength(0);
		expect(accounts.prepare('SELECT COUNT(*) n FROM users').get()).toEqual({ n: 0 });
		expect(accounts.prepare('SELECT COUNT(*) n FROM households').get()).toEqual({ n: 0 });
		// Someone's real account isn't a demo to end.
		const parent = device();
		await parent.signIn('pat@example.com');
		expect((await parent.del('/api/account/demo')).status).toBe(404);
	});

	it('is deleted once its day is over', async () => {
		const visitor = device();
		const first = await visitor.post('/api/account/demo', {});
		accounts.prepare('UPDATE users SET demo_until = ?').run(new Date(Date.now() - 1000).toISOString());
		// Starting another clears the ones that are over (as the 10-minute round does).
		await device().post('/api/account/demo', {});
		const left = accounts.prepare('SELECT id FROM households').all() as { id: string }[];
		expect(left).toHaveLength(1);
		expect(left[0].id).not.toBe(first.body.household.id);
		expect((await visitor.get('/api/auth/status')).body).toEqual({ signedIn: false });
	});

	it('stops at so many at once, and so many from one device', async () => {
		for (let i = 0; i < 5; i++) expect((await device().post('/api/account/demo', {})).status).toBe(201);
		expect((await device().post('/api/account/demo', {})).status).toBe(429);

		const until = new Date(Date.now() + 3600_000).toISOString();
		const add = accounts.prepare('INSERT INTO users (id, name, demo_until) VALUES (?, ?, ?)');
		for (let i = 5; i < DEMO_MAX; i++) add.run(randomUUID(), 'Alex', until);
		expect((await device().post('/api/account/demo', {})).status).toBe(503);
	});
});
