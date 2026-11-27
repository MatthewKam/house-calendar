import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { householdRegistry } from './households.ts';
import { percentile, serverHealth, size, watchTiming, type ServerHealth } from './health.ts';
import type { SyncStatus } from '../shared/calendars.ts';

let dir: string;
let health: ServerHealth | undefined;
afterEach(() => {
	health?.stop();
	if (dir) rmSync(dir, { recursive: true, force: true });
});

const status = (lastSuccess: string | null, more: Partial<SyncStatus> = {}): SyncStatus => ({
	provider: 'google',
	running: false,
	lastSuccess,
	lastError: null,
	calendars: 1,
	events: 1,
	canWrite: true,
	...more,
});

function setup(statuses: SyncStatus[], used = 300e6) {
	dir = mkdtempSync(join(tmpdir(), 'health-'));
	mkdirSync(join(dir, 'households', 'h1'), { recursive: true });
	writeFileSync(join(dir, 'households', 'h1', 'calendar.db'), Buffer.alloc(3000));
	writeFileSync(join(dir, 'households', 'h1', 'photo.jpg'), Buffer.alloc(5000));
	const households = householdRegistry(() => {
		const app = Fastify();
		return { app, db: {} as never, syncStatuses: () => statuses, close: () => app.close() };
	});
	const now = Date.parse('2026-11-27T12:00:00Z');
	health = serverHealth({
		dataDir: dir,
		households: () => households,
		householdCount: () => 3,
		memory: () => ({ used, total: 1e9 }),
		now: () => now,
	});
	return { households, health, now };
}

const gauge = (h: Awaited<ReturnType<ServerHealth['snapshot']>>, id: string) => h.gauges.find((g) => g.id === id)!;

describe('the server health', () => {
	it('sizes and percentiles read plainly', () => {
		expect(size(412e6)).toBe('412 MB');
		expect(size(1.25e9)).toBe('1.3 GB');
		expect(percentile([5, 1, 4, 2, 3], 0.95)).toBe(5);
		expect(percentile([], 0.95)).toBe(0);
	});

	it('marks memory amber from 70% and red from 85%', async () => {
		expect(gauge(await setup([], 300e6).health.snapshot(), 'memory').level).toBe('ok');
		health!.stop();
		expect(gauge(await setup([], 750e6).health.snapshot(), 'memory')).toMatchObject({
			level: 'warn',
			value: '750 MB of 1.0 GB',
		});
		health!.stop();
		expect(gauge(await setup([], 900e6).health.snapshot(), 'memory').level).toBe('bad');
	});

	it('counts what is stored, databases apart from photos, and the households running', async () => {
		const { households, health } = setup([]);
		await households.get({ id: 'h1' } as never);
		const snap = await health.snapshot();
		expect(gauge(snap, 'data').detail).toBe('Databases 3 KB, photos and other files 5 KB.');
		expect(gauge(snap, 'households').value).toBe('1 of 3');
	});

	it('counts calendar accounts that have not synced for 15 minutes as behind', async () => {
		const { households, health } = setup([
			status('2026-11-27T11:58:00Z'),
			status('2026-11-27T11:30:00Z'),
			status(null, { lastError: 'Google said no' }),
			status(null, { running: true }),
		]);
		await households.get({ id: 'h1' } as never);
		expect(gauge(await health.snapshot(), 'syncs')).toMatchObject({ value: '2 of 4', level: 'bad' });
	});

	it('times answers by route, leaving out the ones that wait for a change', async () => {
		const { health } = setup([]);
		const app = Fastify();
		watchTiming(app, health.timing);
		app.get('/api/tasks/:id', async () => ({}));
		app.get('/api/events/live', async () => ({}));
		await app.inject('/api/tasks/1');
		await app.inject('/api/tasks/2');
		await app.inject('/api/events/live');
		const snap = await health.snapshot();
		expect(snap.slowest.map((r) => [r.route, r.count])).toEqual([['GET /api/tasks/:id', 2]]);
		expect(gauge(snap, 'speed').detail).toContain("last hour's 2 requests");
	});
});
