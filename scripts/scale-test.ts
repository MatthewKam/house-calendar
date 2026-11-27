// How many households fit on one machine? Starts made-up households the way the server does (each its own app
// on its own database, kept running), filled like the site's demo family (server/demo.ts), and measures the
// server's memory, how long each takes to start, and how fast they answer. On this computer, in a throwaway
// folder: never the live site. Google and iCloud aren't reached (nothing's connected), so syncs aren't counted.
//
//   node --expose-gc --import tsx scripts/scale-test.ts [100,250,500]
//
// Prints a table; docs/scale.md (on the admin's computer) has what it found.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HTTPMethods } from 'fastify';
import { openDb } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import { fillDemo, type Call } from '../server/demo.ts';
import { percentile } from '../server/health.ts';

const steps = (process.argv[2] ?? '50,100,250,500')
	.split(',')
	.map(Number)
	.filter((n) => n > 0);
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) console.warn('Run with node --expose-gc for steady memory figures.');

const dir = mkdtempSync(join(tmpdir(), 'sprig-scale-'));
type Home = { app: ReturnType<typeof buildApp>; db: ReturnType<typeof openDb>; timer: NodeJS.Timeout };
const homes: Home[] = [];

/** The server's memory once the garbage is collected: what it really holds. */
function memory() {
	gc?.();
	gc?.();
	const m = process.memoryUsage();
	return { rss: m.rss, heap: m.heapUsed };
}

/** One more household, as the server makes one, filled with the demo family's week. */
async function addHousehold(i: number) {
	const db = openDb(join(dir, `h${i}`, 'calendar.db'));
	const app = buildApp(db, { photosDir: join(dir, `h${i}`, 'photos') });
	// Like each household's own timers on the server (its syncs and daily clean-up): they hold memory too.
	const timer = setInterval(() => {}, 5 * 60_000);
	await app.ready();
	app.log.level = 'warn';
	const call: Call = async (method, url, body) => {
		const res = await app.inject({ method: method as HTTPMethods, url, payload: body as object });
		if (res.statusCode >= 400) throw new Error(`${method} ${url}: ${res.statusCode} ${res.body}`);
		return (res.statusCode === 204 ? undefined : res.json()) as never;
	};
	const alex = await call<{ id: string }>('POST', '/api/members', { name: 'Alex', color: '#3b82f6' });
	await fillDemo(call, alex.id, 'America/Los_Angeles');
	homes.push({ app, db, timer });
}

/** How fast households answer: the calendar's week and the tasks, from households picked at random. */
async function answers(n: number) {
	const from = new Date(Date.now() - 3 * 86_400_000);
	const to = new Date(Date.now() + 4 * 86_400_000);
	const week = `/api/events?from=${from.toISOString()}&to=${to.toISOString()}&fromDay=${from.toISOString().slice(0, 10)}&toDay=${to.toISOString().slice(0, 10)}`;
	const times: number[] = [];
	const started = performance.now();
	for (let i = 0; i < n; i++) {
		const home = homes[Math.floor(Math.random() * homes.length)];
		const t = performance.now();
		const res = await home.app.inject(i % 2 ? week : '/api/tasks');
		if (res.statusCode !== 200) throw new Error(`answer ${res.statusCode}`);
		times.push(performance.now() - t);
	}
	return {
		p50: percentile(times, 0.5),
		p95: percentile(times, 0.95),
		perSecond: n / ((performance.now() - started) / 1000),
	};
}

const mb = (b: number) => `${Math.round(b / 1e6)} MB`;
const base = memory();
console.log(`Empty server: ${mb(base.rss)} memory (${mb(base.heap)} heap)\n`);
console.log('households | memory | heap | per household | start each | answer p50 | p95 | answers/s');
try {
	for (const target of steps) {
		const start = performance.now();
		const before = homes.length;
		while (homes.length < target) await addHousehold(homes.length);
		const each = (performance.now() - start) / Math.max(1, target - before);
		const m = memory();
		const a = await answers(500);
		console.log(
			[
				String(target).padStart(10),
				mb(m.rss).padStart(6),
				mb(m.heap).padStart(4),
				`${((m.rss - base.rss) / target / 1e6).toFixed(1)} MB`.padStart(13),
				`${Math.round(each)} ms`.padStart(10),
				`${a.p50.toFixed(1)} ms`.padStart(10),
				`${a.p95.toFixed(1)} ms`.padStart(7),
				String(Math.round(a.perSecond)).padStart(9),
			].join(' | '),
		);
	}
} finally {
	for (const h of homes) {
		clearInterval(h.timer);
		await h.app.close();
		h.db.close();
	}
	rmSync(dir, { recursive: true, force: true });
}
