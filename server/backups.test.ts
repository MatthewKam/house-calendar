import { describe, expect, it } from 'vitest';
import { openAccounts } from './accounts.ts';
import { backupPrefix, clearGoneBackups, s3Bucket, type Bucket } from './backups.ts';

/** A pretend bucket: keys in a set, and a remove that can be made to fail. */
function fakeBucket(keys: string[]) {
	const left = new Set(keys);
	let failing = false;
	const bucket: Bucket = {
		list: async (prefix) => [...left].filter((k) => k.startsWith(prefix)),
		remove: async (key) => {
			if (failing) throw new Error('bucket down');
			left.delete(key);
		},
	};
	return { bucket, left, fail: (f: boolean) => (failing = f) };
}

describe('clearing deleted households’ backups', () => {
	it('clears only the noted databases, then forgets them', async () => {
		const accounts = openAccounts(':memory:');
		accounts.prepare('INSERT INTO gone_backups (db_file) VALUES (?)').run('households/a/calendar.db');
		const { bucket, left } = fakeBucket([
			'backups/households/a/calendar.db/ltx/0/1.ltx',
			'backups/households/a/calendar.db/ltx/9/2.ltx',
			'backups/households/ab/calendar.db/ltx/0/1.ltx',
			'backups/accounts.db/ltx/0/1.ltx',
		]);
		expect(await clearGoneBackups(accounts, bucket)).toBe(1);
		expect([...left]).toEqual(['backups/households/ab/calendar.db/ltx/0/1.ltx', 'backups/accounts.db/ltx/0/1.ltx']);
		expect(accounts.prepare('SELECT * FROM gone_backups').all()).toEqual([]);
	});

	it('clears nothing when nothing was deleted, even with backups of databases not here', async () => {
		const { bucket, left } = fakeBucket(['backups/households/x/calendar.db/ltx/0/1.ltx']);
		expect(await clearGoneBackups(openAccounts(':memory:'), bucket)).toBe(0);
		expect(left.size).toBe(1);
	});

	it('keeps the note when the bucket fails, and finishes next time', async () => {
		const accounts = openAccounts(':memory:');
		accounts.prepare('INSERT INTO gone_backups (db_file) VALUES (?)').run('calendar.db');
		const { bucket, left, fail } = fakeBucket(['backups/calendar.db/ltx/0/1.ltx']);
		fail(true);
		await expect(clearGoneBackups(accounts, bucket)).rejects.toThrow('bucket down');
		expect(accounts.prepare('SELECT COUNT(*) n FROM gone_backups').get()).toEqual({ n: 1 });
		fail(false);
		await clearGoneBackups(accounts, bucket);
		expect(left.size).toBe(0);
	});

	it('puts a database’s copies at its path under backups/', () => {
		expect(backupPrefix('households/a/calendar.db')).toBe('backups/households/a/calendar.db/');
	});
});

describe('the S3 bucket', () => {
	it('lists every page, then deletes by key, with signed requests', async () => {
		const calls: { method: string; url: string; auth: string }[] = [];
		const pages = [
			'<ListBucketResult><Key>backups/a.db/1</Key><IsTruncated>true</IsTruncated><NextContinuationToken>t&amp;2</NextContinuationToken></ListBucketResult>',
			'<ListBucketResult><Key>backups/a.db/2</Key><IsTruncated>false</IsTruncated></ListBucketResult>',
		];
		const fake = (async (url: string, init: RequestInit) => {
			calls.push({ method: init.method!, url, auth: (init.headers as Record<string, string>).authorization });
			return new Response(init.method === 'GET' ? pages.shift() : null, { status: init.method === 'GET' ? 200 : 204 });
		}) as typeof fetch;
		const bucket = s3Bucket(
			{ endpoint: 'https://fly.storage.tigris.dev', bucket: 'b', accessKeyId: 'id', secretAccessKey: 'secret' },
			fake,
			() => new Date('2026-11-16T18:30:00Z'),
		);
		expect(await bucket.list('backups/a.db/')).toEqual(['backups/a.db/1', 'backups/a.db/2']);
		await bucket.remove('backups/a.db/1');
		expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
			'GET https://fly.storage.tigris.dev/b?list-type=2&prefix=backups%2Fa.db%2F',
			'GET https://fly.storage.tigris.dev/b?continuation-token=t%262&list-type=2&prefix=backups%2Fa.db%2F',
			'DELETE https://fly.storage.tigris.dev/b/backups/a.db/1',
		]);
		expect(calls[0].auth).toMatch(
			/^AWS4-HMAC-SHA256 Credential=id\/20261116\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
		);
	});
});
