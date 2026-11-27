import { afterEach, describe, expect, it } from 'vitest';
import inject from 'light-my-request';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAccounts } from './accounts.ts';
import { householdRegistry } from './households.ts';
import { buildServer } from './hosted.ts';

// The test copy of the site (fly.test.toml): every page says so, and search engines are told to skip it.
let dir: string;
let server: ReturnType<typeof buildServer>;
afterEach(async () => {
	await server.close();
	rmSync(dir, { recursive: true, force: true });
});

async function start(siteLabel?: string) {
	dir = mkdtempSync(join(tmpdir(), 'site-'));
	writeFileSync(join(dir, 'index.html'), '<!doctype html><html lang="en"><body><div id="app"></div></body></html>');
	const households = householdRegistry(() => {
		throw new Error('no households here');
	});
	server = buildServer(openAccounts(':memory:'), households, { dataDir: dir, webDist: dir, logger: false, siteLabel });
	await server.app.ready();
}

describe('the test site', () => {
	it("marks the app's pages and asks not to be indexed", async () => {
		await start('test');
		for (const url of ['/', '/index.html', '/admin', '/cook/abc/def']) {
			const res = await inject(server.handle, { url });
			expect(res.body, url).toContain('<html data-site="test" lang="en">');
			expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
		}
		expect((await inject(server.handle, { url: '/health' })).headers['x-robots-tag']).toBe('noindex, nofollow');
	});

	it('leaves the real site as it is', async () => {
		await start();
		const res = await inject(server.handle, { url: '/' });
		expect(res.body).not.toContain('data-site');
		expect(res.headers['x-robots-tag']).toBeUndefined();
	});
});
