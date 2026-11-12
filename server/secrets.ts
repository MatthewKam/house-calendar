import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Encrypts what would let someone read a family's calendars (Google refresh tokens) before it's
// stored, so a copied database file alone isn't enough. The key comes from SECRET_KEY (hosted), or
// a file made on first start next to the data (your own machine).

export interface Sealer {
	seal(text: string): string;
	open(sealed: string): string;
}

/** `key`: 32 bytes. AES-256-GCM; each value has its own nonce. */
export function sealer(key: Buffer): Sealer {
	if (key.length !== 32) throw new Error('The secret key must be 32 bytes');
	return {
		seal(text) {
			const iv = randomBytes(12);
			const c = createCipheriv('aes-256-gcm', key, iv);
			const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
			return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url')}`;
		},
		open(sealed) {
			const raw = Buffer.from(sealed.replace(/^v1:/, ''), 'base64url');
			const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
			d.setAuthTag(raw.subarray(12, 28));
			return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
		},
	};
}

/** SECRET_KEY (base64, 32 bytes), or the key file, made the first time. */
export function loadKey(fromEnv: string | undefined, file: string) {
	if (fromEnv) return Buffer.from(fromEnv, 'base64');
	if (!existsSync(file)) {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
	}
	return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
}
