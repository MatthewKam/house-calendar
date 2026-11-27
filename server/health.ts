import type { FastifyInstance } from 'fastify';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { readdir, stat } from 'node:fs/promises';
import { statfsSync } from 'node:fs';
import { totalmem } from 'node:os';
import { join } from 'node:path';
import type { HouseholdRegistry } from './households.ts';
import type { AdminHealth, HealthGauge, HealthLevel } from '../shared/admin.ts';

// The server's own health, for the admin page: is the one machine running out of anything? Each figure has
// a level (fine, watch it, act now), its thresholds here beside it. docs/scale.md (on the admin's computer)
// says what to do when one turns amber or red. Nothing in it is about anyone: sizes, counts and timings.

/** Memory used, of the machine's: amber from 70%, red from 85% (the server stops when it runs out). */
const MEMORY = { warn: 0.7, bad: 0.85 };
/** The data disk: amber when 70% full, red at 85% (photos and videos fill it; Fly volumes can be grown). */
const DISK = { warn: 0.7, bad: 0.85 };
/** How long the server took to get round to things (its event loop's delay, 99th percentile over the hour). */
const BUSY_MS = { warn: 100, bad: 500 };
/** How long requests took (95th percentile over the hour), not counting ones that wait for a change on purpose. */
const SPEED_MS = { warn: 1000, bad: 3000 };
/** A calendar account is behind when it hasn't synced for this long (it syncs every 5 minutes). */
const BEHIND_MS = 15 * 60_000;
/** Syncs behind: amber from one account, red from a quarter of them. */
const SYNCS_BAD = 0.25;

const MINUTE = 60_000;
/** Request timings kept per minute, at most (enough for a fair 95th percentile). */
const SAMPLES = 2000;

const level = (v: number, t: { warn: number; bad: number }): HealthLevel =>
	v >= t.bad ? 'bad' : v >= t.warn ? 'warn' : 'ok';

/** "412 MB", "1.2 GB". */
export function size(bytes: number) {
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
	if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
	return `${Math.round(bytes / 1e3)} KB`;
}

/** The value at fraction `p` (0 to 1) of these, sorted. */
export function percentile(values: number[], p: number) {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** Every file's size under a folder, split into databases (with their -wal and -shm) and everything else. */
async function folderSizes(dir: string) {
	let databases = 0;
	let other = 0;
	const walk = async (d: string) => {
		for (const entry of await readdir(d, { withFileTypes: true }).catch(() => [])) {
			const path = join(d, entry.name);
			if (entry.isDirectory()) await walk(path);
			else if (entry.isFile()) {
				const bytes = (await stat(path).catch(() => ({ size: 0 }))).size;
				if (/\.db(-wal|-shm)?$/.test(entry.name)) databases += bytes;
				else other += bytes;
			}
		}
	};
	await walk(dir);
	return { databases, other };
}

export type ServerHealth = ReturnType<typeof serverHealth>;

export function serverHealth(opts: {
	dataDir: string;
	households: () => HouseholdRegistry;
	/** How many households there are in all (running or not). */
	householdCount: () => number;
	memory?: () => { used: number; total: number };
	now?: () => number;
}) {
	const now = opts.now ?? Date.now;
	const memory = opts.memory ?? (() => ({ used: process.memoryUsage().rss, total: totalmem() }));
	const startedAt = new Date(now()).toISOString();

	// The event loop's delay, each minute's 99th percentile, for the last hour.
	const loop = monitorEventLoopDelay({ resolution: 20 });
	loop.enable();
	const busy: number[] = [];
	const everyMinute = setInterval(() => {
		busy.push(loop.percentile(99) / 1e6);
		if (busy.length > 60) busy.shift();
		loop.reset();
	}, MINUTE);
	everyMinute.unref();

	// Request timings by minute, for the last hour.
	const minutes = new Map<number, { times: number[]; routes: Map<string, number[]> }>();
	function timing(route: string, ms: number) {
		const minute = Math.floor(now() / MINUTE);
		let m = minutes.get(minute);
		if (!m) {
			minutes.set(minute, (m = { times: [], routes: new Map() }));
			for (const k of minutes.keys()) if (k <= minute - 60) minutes.delete(k);
		}
		if (m.times.length >= SAMPLES) return;
		m.times.push(ms);
		const r = m.routes.get(route);
		if (r) r.push(ms);
		else m.routes.set(route, [ms]);
	}

	// Folder sizes take a walk through every photo: at most every 10 minutes.
	let sizes: { at: number; value: Promise<{ databases: number; other: number }> } | null = null;
	const sizesNow = () => {
		if (!sizes || now() - sizes.at > 10 * MINUTE) sizes = { at: now(), value: folderSizes(opts.dataDir) };
		return sizes.value;
	};

	async function snapshot(): Promise<AdminHealth> {
		const gauges: HealthGauge[] = [];

		const mem = memory();
		gauges.push({
			id: 'memory',
			label: 'Memory',
			value: `${size(mem.used)} of ${size(mem.total)}`,
			detail: `${Math.round((mem.used / mem.total) * 100)}% used. The server stops if it runs out.`,
			level: level(mem.used / mem.total, MEMORY),
		});

		const { databases, other } = await sizesNow();
		try {
			const fs = statfsSync(opts.dataDir);
			const total = fs.blocks * fs.bsize;
			const free = fs.bavail * fs.bsize;
			gauges.push({
				id: 'disk',
				label: 'Disk',
				value: `${size(total - free)} of ${size(total)}`,
				detail: `${size(free)} free.`,
				level: level((total - free) / total, DISK),
			});
		} catch {
			// No disk figures here (it isn't a folder of its own): left out.
		}
		gauges.push({
			id: 'data',
			label: 'Stored',
			value: size(databases + other),
			detail: `Databases ${size(databases)}, photos and other files ${size(other)}.`,
			level: 'ok',
		});

		const registry = opts.households();
		gauges.push({
			id: 'households',
			label: 'Households running',
			value: `${registry.running()} of ${opts.householdCount()}`,
			detail: 'Each runs all the time, with its own database and syncs.',
			level: 'ok',
		});

		const busyMs = Math.max(loop.percentile(99) / 1e6, ...busy);
		gauges.push({
			id: 'busy',
			label: 'Busy',
			value: `${Math.round(busyMs)} ms`,
			detail: 'Longest wait before the server could get to something, over the last hour.',
			level: level(busyMs, BUSY_MS),
		});

		const hour = Math.floor(now() / MINUTE) - 60;
		const recent = [...minutes].filter(([k]) => k > hour).map(([, m]) => m);
		const times = recent.flatMap((m) => m.times);
		const p95 = percentile(times, 0.95);
		gauges.push({
			id: 'speed',
			label: 'Answers',
			value: times.length ? `${Math.round(p95)} ms` : '—',
			detail: `95% of the last hour's ${times.length} requests were answered within this.`,
			level: level(p95, SPEED_MS),
		});

		const statuses = (await registry.all()).flatMap((h) => h.syncStatuses?.() ?? []);
		const behind = statuses.filter(
			(s) => !s.running && (s.lastSuccess ? now() - Date.parse(s.lastSuccess) > BEHIND_MS : !!s.lastError),
		).length;
		gauges.push({
			id: 'syncs',
			label: 'Calendar syncs behind',
			value: `${behind} of ${statuses.length}`,
			detail: "Google and iCloud accounts that haven't synced for 15 minutes.",
			level: behind === 0 ? 'ok' : behind / statuses.length >= SYNCS_BAD ? 'bad' : 'warn',
		});

		const byRoute = new Map<string, number[]>();
		for (const m of recent)
			for (const [route, list] of m.routes) byRoute.set(route, [...(byRoute.get(route) ?? []), ...list]);
		const slowest = [...byRoute]
			.map(([route, list]) => ({
				route,
				count: list.length,
				maxMs: Math.round(Math.max(...list)),
				p95Ms: Math.round(percentile(list, 0.95)),
			}))
			.sort((a, b) => b.p95Ms - a.p95Ms)
			.slice(0, 8);

		return { gauges, slowest, startedAt };
	}

	return {
		timing,
		snapshot,
		stop() {
			clearInterval(everyMinute);
			loop.disable();
		},
	};
}

/**
 * Times a Fastify app's API answers by route pattern, for the server health. Not the page's files, or the ones that
 * wait for a change on purpose (…/live, answered when something changes or after 20 seconds).
 */
export function watchTiming(app: FastifyInstance, timing: (route: string, ms: number) => void) {
	app.addHook('onResponse', async (req, reply) => {
		const route = req.routeOptions.url;
		if (!route?.startsWith('/api/') || route.includes('/live')) return;
		timing(`${req.method} ${route}`, reply.elapsedTime);
	});
}
