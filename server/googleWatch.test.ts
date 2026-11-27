import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { openDb, type DB } from './db.ts';
import { sealer } from './secrets.ts';
import { GoogleSource, type GoogleOAuth } from './providers/google.ts';
import { googleCalendars } from './googleSync.ts';
import { googleWatches, RENEW_WITHIN_MS, UNSUPPORTED_RETRY_MS, WATCH_SECONDS, type Watcher } from './googleWatch.ts';
import { CHANGED_WAIT_MS } from './sync.ts';

const DAY = 24 * 3_600_000;
const ADDRESS = 'https://sprig.test/api/google/notify/h1';
const quiet = { error: () => {}, info: () => {} };

/** A calendar the account brings in, as a sync leaves it. */
function calendar(db: DB, remoteId: string, source = 'google:c1') {
	db.prepare('INSERT INTO calendars (id, provider, source, remote_id, name) VALUES (?, ?, ?, ?, ?)').run(
		`${source}/${remoteId}`,
		'google',
		source,
		remoteId,
		remoteId,
	);
}

/** A pretend Google, as far as watches go: what was asked, and which calendars it won't watch. */
function fakeWatcher(opts: { unsupported?: string[]; failing?: string[]; now: () => number }) {
	const calls: string[] = [];
	let n = 0;
	const watcher: Watcher = {
		async watch(calendar, channel) {
			calls.push(`watch ${calendar}`);
			expect(channel).toMatchObject({ address: ADDRESS, ttlSeconds: WATCH_SECONDS });
			if (opts.failing?.includes(calendar)) throw new Error('Google is down');
			if (opts.unsupported?.includes(calendar)) return null;
			return { resourceId: `r${++n}`, expiresAt: opts.now() + 7 * DAY };
		},
		async unwatch(channelId, resourceId) {
			calls.push(`stop ${resourceId}`);
		},
	};
	return { watcher, calls };
}

const rows = (db: DB) =>
	db.prepare('SELECT * FROM google_watches ORDER BY calendar').all() as {
		channel_id: string;
		calendar: string;
		token: string;
		resource_id: string | null;
	}[];

describe('Google watches', () => {
	let clock = Date.parse('2026-12-01T12:00:00Z');
	const now = () => clock;

	it("watches each of an account's calendars once, and knows Google's calls by channel and token", async () => {
		const db = openDb(':memory:');
		calendar(db, 'alex@gmail.com');
		calendar(db, 'team@group.calendar.google.com');
		const { watcher, calls } = fakeWatcher({ now });
		const w = googleWatches(db, { address: ADDRESS, log: quiet, now });
		await w.renew('google:c1', watcher);
		expect(calls).toEqual(['watch alex@gmail.com', 'watch team@group.calendar.google.com']);
		const [a, b] = rows(db);
		expect(a.token).not.toBe(b.token);
		expect(w.check(a.channel_id, a.token)).toBe('google:c1');
		expect(w.check(a.channel_id, b.token)).toBeNull();
		expect(w.check('someone-else', a.token)).toBeNull();
		expect(w.check(undefined, undefined)).toBeNull();
		// The next sync: nothing to do while they're good for more than a day.
		clock += 5 * DAY;
		await w.renew('google:c1', watcher);
		expect(calls).toHaveLength(2);
	});

	it('renews a watch near its end (the new one first), and stops those on calendars that went', async () => {
		const db = openDb(':memory:');
		calendar(db, 'alex@gmail.com');
		calendar(db, 'team@group.calendar.google.com');
		const { watcher, calls } = fakeWatcher({ now });
		const w = googleWatches(db, { address: ADDRESS, log: quiet, now });
		await w.renew('google:c1', watcher);
		const before = rows(db)[0];
		db.prepare("DELETE FROM calendars WHERE remote_id = 'team@group.calendar.google.com'").run();
		clock += 7 * DAY - RENEW_WITHIN_MS + 60_000;
		calls.length = 0;
		await w.renew('google:c1', watcher);
		expect(calls).toEqual(['stop r2', 'watch alex@gmail.com', 'stop r1']);
		const after = rows(db);
		expect(after.map((r) => r.resource_id)).toEqual(['r3']);
		// The old channel's calls are ignored now.
		expect(w.check(before.channel_id, before.token)).toBeNull();
	});

	it("leaves a calendar Google won't watch for a day, and tries one that failed again next sync", async () => {
		const db = openDb(':memory:');
		calendar(db, 'holidays');
		calendar(db, 'alex@gmail.com');
		const google = fakeWatcher({ now, unsupported: ['holidays'], failing: ['alex@gmail.com'] });
		const w = googleWatches(db, { address: ADDRESS, log: quiet, now });
		await w.renew('google:c1', google.watcher);
		expect(rows(db)).toMatchObject([{ calendar: 'holidays', resource_id: null }]);
		// No watch there, so no call can claim one.
		expect(w.check(rows(db)[0].channel_id, rows(db)[0].token)).toBeNull();
		google.calls.length = 0;
		await w.renew('google:c1', google.watcher);
		expect(google.calls).toEqual(['watch alex@gmail.com']);
		clock += UNSUPPORTED_RETRY_MS + 1;
		google.calls.length = 0;
		await w.renew('google:c1', google.watcher);
		expect(google.calls).toEqual(['watch holidays', 'watch alex@gmail.com']);
	});

	it("stops an account's watches, and forgets those of accounts no longer connected", async () => {
		const db = openDb(':memory:');
		calendar(db, 'alex@gmail.com');
		calendar(db, 'sam@gmail.com', 'google:c2');
		const { watcher, calls } = fakeWatcher({ now });
		const w = googleWatches(db, { address: ADDRESS, log: quiet, now });
		await w.renew('google:c1', watcher);
		await w.renew('google:c2', watcher);
		await w.stopAll('google:c1', watcher);
		expect(calls.at(-1)).toBe('stop r1');
		expect(rows(db).map((r) => r.calendar)).toEqual(['sam@gmail.com']);
		w.clearGone();
		expect(rows(db)).toEqual([]);
	});
});

/** Google's API as far as calendars, their events and watches go; `log` is each call made. */
function fakeGoogleApi() {
	const log: string[] = [];
	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
	const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		const path = url.pathname.replace('/calendar/v3', '');
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		log.push(`${init?.method ?? 'GET'} ${decodeURIComponent(path)}`);
		if (path === '/users/me/calendarList')
			return json({ items: [{ id: 'alex@gmail.com', summary: 'Alex', accessRole: 'owner', primary: true }] });
		if (path.endsWith('/events/watch')) {
			expect(body).toMatchObject({ type: 'web_hook', address: ADDRESS, params: { ttl: String(WATCH_SECONDS) } });
			return json({ kind: 'api#channel', id: body.id, resourceId: 'res-1', expiration: String(Date.now() + 7 * DAY) });
		}
		if (path === '/channels/stop') {
			expect(body).toEqual({ id: expect.any(String), resourceId: 'res-1' });
			return new Response(null, { status: 204 });
		}
		if (path.endsWith('/events')) return json({ items: [] });
		return json({ error: 'not found' }, 404);
	}) as typeof fetch;
	return { fetchImpl, log };
}

const oauth = (log: string[]): GoogleOAuth => ({
	authUrl: () => '',
	exchange: async () => ({ refreshToken: 'r', account: 'alex@gmail.com' }),
	accessToken: async () => ({
		token: 't',
		expiresAt: Date.now() + 3_600_000,
		scope: 'https://www.googleapis.com/auth/calendar.events',
	}),
	revoke: async () => void log.push('revoke'),
});

describe("Google's watch calls", () => {
	it('asks to watch a calendar and to stop, and takes a calendar Google won’t watch calmly', async () => {
		const { fetchImpl, log } = fakeGoogleApi();
		const source = new GoogleSource('google:c1', null, 'alex@gmail.com', 'r', oauth(log), fetchImpl);
		const made = await source.watch('alex@gmail.com', {
			id: 'ch',
			token: 'tok',
			address: ADDRESS,
			ttlSeconds: WATCH_SECONDS,
		});
		expect(made).toMatchObject({ resourceId: 'res-1' });
		await source.unwatch('ch', 'res-1');
		expect(log).toEqual(['POST /calendars/alex@gmail.com/events/watch', 'POST /channels/stop']);

		const refusing = (async () =>
			new Response(JSON.stringify({ error: { errors: [{ reason: 'pushNotSupportedForRequestedResource' }] } }), {
				status: 400,
			})) as unknown as typeof fetch;
		const holidays = new GoogleSource('google:c1', null, 'alex@gmail.com', 'r', oauth([]), refusing);
		expect(
			await holidays.watch('holidays', { id: 'ch', token: 'tok', address: ADDRESS, ttlSeconds: WATCH_SECONDS }),
		).toBeNull();
	});
});

describe('Google calling Sprig', () => {
	afterEach(() => void vi.useRealTimers());

	it('watches after the first sync, syncs again a moment after Google calls, and stops before access goes', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
		const db = openDb(':memory:');
		const { fetchImpl, log } = fakeGoogleApi();
		const google = googleCalendars(db, {
			oauth: oauth(log),
			fetchImpl,
			sealer: sealer(randomBytes(32)),
			log: quiet,
			notifyAddress: ADDRESS,
		});
		google.connect({ memberId: null, account: 'alex@gmail.com', refreshToken: 'r' });
		await vi.advanceTimersByTimeAsync(10);
		const fetches = () => log.filter((l) => l.startsWith('GET /calendars/')).length;
		expect(fetches()).toBe(1);
		const [watch] = rows(db);
		expect(watch.resource_id).toBe('res-1');

		// Google's first call only says the watch has started.
		expect(google.notified(watch.channel_id, watch.token, 'sync')).toBe(true);
		await vi.advanceTimersByTimeAsync(CHANGED_WAIT_MS + 10);
		expect(fetches()).toBe(1);
		// A change: a few calls together make one sync, a moment later.
		for (let i = 0; i < 3; i++) expect(google.notified(watch.channel_id, watch.token, 'exists')).toBe(true);
		await vi.advanceTimersByTimeAsync(CHANGED_WAIT_MS + 10);
		expect(fetches()).toBe(2);
		// Someone else's call does nothing.
		expect(google.notified(watch.channel_id, 'guess', 'exists')).toBe(false);
		await vi.advanceTimersByTimeAsync(CHANGED_WAIT_MS + 10);
		expect(fetches()).toBe(2);

		const [conn] = google.list();
		await google.remove(conn.id);
		expect(log.slice(-2)).toEqual(['POST /channels/stop', 'revoke']);
		expect(rows(db)).toEqual([]);
		google.stop();
	});

	it("doesn't watch without an address Google can reach (while developing)", async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
		const db = openDb(':memory:');
		const { fetchImpl, log } = fakeGoogleApi();
		const google = googleCalendars(db, { oauth: oauth(log), fetchImpl, sealer: sealer(randomBytes(32)), log: quiet });
		google.connect({ memberId: null, account: 'alex@gmail.com', refreshToken: 'r' });
		await vi.advanceTimersByTimeAsync(10);
		expect(log.some((l) => l.endsWith('/watch'))).toBe(false);
		expect(google.notified('anything', 'anything', 'exists')).toBe(false);
		google.stop();
	});
});
