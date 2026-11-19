// App Review's demo household (docs/app-store.md): signs in as REVIEW_EMAIL with REVIEW_CODE and fills a
// made-up family through the app's own API, as someone using the app would. Only ever that account.
//
//   npx tsx scripts/demo-household.ts [https://sprig-family.com] [--fresh]
//
// --fresh deletes the reviewer's account and household first (Settings → Delete my account), so the demo
// can be made again before a review with this week's dates. Without it, an account that already has a
// household is left alone.

import { readFileSync } from 'node:fs';
import { fillDemo } from '../server/demo.ts';

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) ?? 'https://sprig-family.com').replace(/\/$/, '');
const fresh = args.includes('--fresh');
const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split('\n')
		.filter((l) => /^[A-Z_]+=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const email = env.REVIEW_EMAIL;
const code = env.REVIEW_CODE;
if (!email || !code) throw new Error('REVIEW_EMAIL and REVIEW_CODE must be in .env');

// The reviewers are most likely in California; the family's week is laid out there.
const ZONE = 'America/Los_Angeles';
const PIN = '1234';

let cookie = '';
async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(base + path, {
		method,
		headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const set = res.headers.get('set-cookie');
	if (set) cookie = set.split(';')[0];
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
	return (res.status === 204 ? undefined : await res.json()) as T;
}

interface Status {
	signedIn: boolean;
	households?: { id: string }[];
	memberId?: string | null;
}

await call('POST', '/api/account/email/start', { email });
const before = await call<Status>('POST', '/api/account/email/verify', { email, code });
if (before.households?.length) {
	if (!fresh) {
		console.log(`${email} already has a household; run with --fresh to make it again.`);
		process.exit(0);
	}
	await call('DELETE', '/api/account/delete');
	console.log('Deleted the old demo.');
	cookie = '';
	await new Promise((r) => setTimeout(r, 31_000)); // a code can be asked for every 30 seconds
	await call('POST', '/api/account/email/start', { email });
	await call('POST', '/api/account/email/verify', { email, code });
}

const status = await call<Status>('POST', '/api/account/households', { name: 'The Rivera family', yourName: 'Alex' });
const alexId = status.memberId!;
await call('PUT', '/api/account/pin', { pin: PIN });
const today = await fillDemo(call, alexId, ZONE);

console.log(`Demo household made at ${base} for ${email}, the week from ${today}. Kid mode's PIN: ${PIN}.`);
