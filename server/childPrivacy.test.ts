import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHILD_DATA, CHILD_NOT_KEPT, CHILD_USE } from '../shared/childPrivacy.ts';
import { CONSENT_NOTICE } from './codeEmail.ts';

// What Sprig keeps about a child is said in three places (Settings → Family → Children's privacy, the consent
// email, the privacy page); they must say the same thing. The app and the email use the list itself; the page
// is written by hand, so it's checked here.
const page = readFileSync(resolve(import.meta.dirname, '../web/public/pages/privacy.html'), 'utf8')
	.replace(/<[^>]+>/g, ' ')
	.replace(/&amp;/g, '&')
	.replace(/&#39;/g, "'")
	.replace(/&quot;/g, '"')
	.replace(/\s+/g, ' ');

describe("what's kept about a child", () => {
	const all = [...CHILD_DATA.flatMap((g) => [g.title, g.why, ...g.items]), ...CHILD_NOT_KEPT, ...CHILD_USE];

	it('is on the privacy page word for word', () => {
		expect(all.filter((line) => !page.includes(line))).toEqual([]);
	});

	it('is all in the consent email', () => {
		const email = CONSENT_NOTICE.join('\n');
		expect(all.filter((line) => !email.includes(line))).toEqual([]);
	});
});
