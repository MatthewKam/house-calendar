import { createHash, createHmac } from 'node:crypto';
import type { AccountsDB } from './accounts.ts';

// Backups of deleted households. Litestream (deploy/litestream.yml) copies each database to the storage
// bucket, at backups/<its path in the data folder>/, and clears old copies of the ones still there; a
// deleted household's copies it leaves alone. The privacy page promises they're gone within 30 days, so
// deleting a household notes its database (gone_backups), and this clears those from the bucket, trying
// again until it's done. Only what was noted is ever cleared: a blank data folder clears nothing.

/** The bucket, as far as clearing needs it. */
export interface Bucket {
	/** Every key starting with `prefix`. */
	list(prefix: string): Promise<string[]>;
	remove(key: string): Promise<void>;
}

/** Where a database's copies are: its stored path (relative to the data folder) under backups/. */
export const backupPrefix = (dbFile: string) => `backups/${dbFile.replace(/\\/g, '/')}/`;

/** Clears every noted database's copies. Each is forgotten once its copies are gone; a failure is retried next time. */
export async function clearGoneBackups(accounts: AccountsDB, bucket: Bucket) {
	const rows = accounts.prepare('SELECT db_file FROM gone_backups').all() as { db_file: string }[];
	for (const { db_file } of rows) {
		for (const key of await bucket.list(backupPrefix(db_file))) await bucket.remove(key);
		accounts.prepare('DELETE FROM gone_backups WHERE db_file = ?').run(db_file);
	}
	return rows.length;
}

/** Clears now and then every hour. Returns how to stop. */
export function clearBackupsHourly(accounts: AccountsDB, bucket: Bucket, onError: (err: unknown) => void) {
	const run = () => void clearGoneBackups(accounts, bucket).catch(onError);
	run();
	const timer = setInterval(run, 60 * 60_000);
	timer.unref();
	return () => clearInterval(timer);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest();
/** S3's encoding: everything but letters, digits and -._~ (and / in a path). */
const enc = (s: string) =>
	encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (s: string) => s.split('/').map(enc).join('/');

/**
 * The bucket from `fly storage create`'s settings (Tigris speaks S3), with requests signed the S3 way
 * (Signature Version 4). Only listing and deleting, so no SDK.
 */
export function s3Bucket(
	o: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region?: string },
	fetchFn: typeof fetch = fetch,
	now = () => new Date(),
): Bucket {
	const region = o.region || 'auto';
	const base = new URL(o.endpoint);

	async function send(method: 'GET' | 'DELETE', key: string, query: Record<string, string> = {}) {
		const path = key ? `/${enc(o.bucket)}/${encPath(key)}` : `/${enc(o.bucket)}`;
		const qs = Object.keys(query)
			.sort()
			.map((k) => `${enc(k)}=${enc(query[k])}`)
			.join('&');
		const stamp = now()
			.toISOString()
			.replace(/[-:]|\.\d{3}/g, '');
		const day = stamp.slice(0, 8);
		const headers: Record<string, string> = {
			host: base.host,
			'x-amz-content-sha256': sha256(''),
			'x-amz-date': stamp,
		};
		const names = Object.keys(headers).sort();
		const canonical = [
			method,
			path,
			qs,
			names.map((h) => `${h}:${headers[h]}\n`).join(''),
			names.join(';'),
			headers['x-amz-content-sha256'],
		].join('\n');
		const scope = `${day}/${region}/s3/aws4_request`;
		const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256(canonical)].join('\n');
		const key4 = hmac(hmac(hmac(hmac(`AWS4${o.secretAccessKey}`, day), region), 's3'), 'aws4_request');
		const signature = createHmac('sha256', key4).update(toSign).digest('hex');
		const res = await fetchFn(`${base.origin}${path}${qs ? `?${qs}` : ''}`, {
			method,
			headers: {
				...headers,
				authorization: `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
			},
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) throw new Error(`Backup bucket ${method} ${key || query.prefix}: ${res.status} ${await res.text()}`);
		return res;
	}

	return {
		async list(prefix) {
			const keys: string[] = [];
			let token: string | undefined;
			do {
				const xml = await (
					await send('GET', '', { 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) })
				).text();
				for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(unxml(m[1]));
				token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
					? unxml(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '')
					: undefined;
			} while (token);
			return keys;
		},
		async remove(key) {
			await send('DELETE', key);
		},
	};
}

const unxml = (s: string) =>
	s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e as 'lt']);
