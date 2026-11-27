import { CHILD_DATA, CHILD_NOT_KEPT, CHILD_USE } from '../shared/childPrivacy.ts';

// The email with a code in it: to sign in, to set a new PIN, or a guardian's consent for their children
// (identity.ts sends it). Sprig waving at the top, the code big, and a quote to grow on, a different one each
// day. Plain text goes along with it. The consent email is also COPPA's direct notice to the parent (what's
// kept about children, why, who else handles it, their rights); 'consented' confirms it, with no code.

/** What the code is for. */
export type CodeFor = 'sign-in' | 'pin' | 'consent' | 'consented';

const PRIVACY = 'https://sprig-family.com/privacy#children';

/**
 * The notice a guardian reads before giving consent: paragraphs, exactly what's kept about a child (the same
 * words as Settings → Family → Children's privacy and the privacy page, from shared/childPrivacy.ts).
 */
export const CONSENT_NOTICE = [
	'Before you add a child to Sprig, here is exactly what Sprig keeps about children, and your consent as their parent or guardian.',
	...CHILD_DATA.map((g) => [`${g.title}:`, ...g.items.map((i) => `• ${i}`)].join('\n')),
	['Never kept:', ...CHILD_NOT_KEPT.map((i) => `• ${i}`)].join('\n'),
	["How it's used:", ...CHILD_USE.map((i) => `• ${i}`)].join('\n'),
	"Your rights: you can see, change or delete anything about your child in the app, take this consent back (Settings → Family → Children's privacy), or ask us at hello@sprig-family.com.",
	'Sprig is made and run by Tayno.',
];

/** The confirmation, once consent is given: paragraphs. */
const CONSENTED = [
	"Thank you. You've given consent, as your children's parent or guardian, for Sprig to keep what it needs about them for your family, as the notice said.",
	"To take it back: Settings → Family → Children's privacy → Take back. Your children's devices are signed out, and no more children can be added, until a guardian gives it again. Removing a child deletes what we have about them.",
	"Didn't do this? Write to hello@sprig-family.com and we'll undo it.",
];

/** Quotes about growing, little by little. */
export const GROWTH_QUOTES: { text: string; by: string }[] = [
	{ text: 'Great things are done by a series of small things brought together.', by: 'Vincent van Gogh' },
	{ text: 'Trees that are slow to grow bear the best fruit.', by: 'Molière' },
	{ text: 'Adopt the pace of nature: her secret is patience.', by: 'Ralph Waldo Emerson' },
	{ text: 'The creation of a thousand forests is in one acorn.', by: 'Ralph Waldo Emerson' },
	{ text: 'All the flowers of all the tomorrows are in the seeds of today.', by: 'Proverb' },
	{ text: 'A journey of a thousand miles begins with a single step.', by: 'Lao Tzu' },
	{ text: 'Little by little, a little becomes a lot.', by: 'Tanzanian proverb' },
	{ text: 'Nature does not hurry, yet everything is accomplished.', by: 'Lao Tzu' },
];

/** The day's quote (the same all day, everywhere). */
export const quoteFor = (day: Date) => GROWTH_QUOTES[Math.floor(day.getTime() / 86_400_000) % GROWTH_QUOTES.length];

const esc = (s: string) =>
	s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c as '&']);

/** The email: subject, the page, and plain text. `site` is where Sprig is (for its picture and links). */
export function codeEmail(code: string, purpose: CodeFor, site: string, now = new Date()) {
	const quote = quoteFor(now);
	const what = purpose === 'pin' ? 'set a new PIN' : purpose === 'consent' ? 'give your consent' : 'sign in';
	const subject =
		purpose === 'pin'
			? `${code} is your Sprig PIN code`
			: purpose === 'consent'
				? `${code}: your consent for your children in Sprig`
				: purpose === 'consented'
					? "You've given consent for your children in Sprig"
					: `${code} is your Sprig code`;
	const host = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
	// The consent email's notice, or the confirmation's words, with a link to the full privacy notice.
	const words = purpose === 'consent' ? CONSENT_NOTICE : purpose === 'consented' ? CONSENTED : [];
	const withCode = purpose !== 'consented';
	const text = [
		...(withCode ? [`Hi! Here's your code to ${what}: ${code}`, 'It works for 10 minutes.', ''] : []),
		...(words.length ? [...words.flatMap((p) => [p, '']), `The full notice: ${PRIVACY}`, ''] : []),
		...(withCode ? [`Something to grow on: "${quote.text}" (${quote.by})`, ''] : []),
		...(withCode ? ["Didn't ask for a code? You can ignore this email."] : []),
		`Sprig · ${site} · hello@sprig-family.com`,
	].join('\n');
	const notice = words.length
		? `<tr><td style="padding:0 28px 20px;font-size:14px;line-height:1.5;color:#1f2a1c">${words.map((p) => `<p style="margin:0 0 10px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}<p style="margin:0"><a href="${PRIVACY}" style="color:#6b8f3a">The full notice</a></p></td></tr>`
		: '';
	const heading = purpose === 'consented' ? 'Consent given' : "Hi! Here's your code";
	// Tables and inline styles: what email apps show alike.
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:20px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1f2a1c">
<tr><td align="center" style="padding:28px 28px 0"><img src="${esc(site)}/mascot/sprig-email.png" width="120" alt="Sprig, waving" style="display:block;width:120px;height:auto"></td></tr>
<tr><td align="center" style="padding:12px 28px 0"><h1 style="margin:0;font-size:22px">${heading}</h1>
${withCode ? `<p style="margin:8px 0 0;color:#5b6657;font-size:15px">Type it into Sprig to ${what}.</p>` : ''}</td></tr>
${
	withCode
		? `<tr><td align="center" style="padding:20px 28px"><div style="display:inline-block;padding:14px 22px;border-radius:14px;background:#eef7e6;font-size:34px;font-weight:700;letter-spacing:8px;font-family:Menlo,Consolas,monospace;color:#2f6b3a">${esc(code)}</div>
<p style="margin:10px 0 0;color:#5b6657;font-size:13px">It works for 10 minutes.</p></td></tr>`
		: '<tr><td style="padding:12px"></td></tr>'
}
${notice}
${
	withCode
		? `<tr><td style="padding:0 28px 24px"><div style="border-left:4px solid #8cc63f;background:#f7faf3;border-radius:10px;padding:14px 16px">
<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#6b8f3a;font-weight:700">🌱 Something to grow on</div>
<p style="margin:6px 0 0;font-size:16px;line-height:1.4">“${esc(quote.text)}”</p>
<p style="margin:4px 0 0;font-size:13px;color:#5b6657">${esc(quote.by)}</p></div></td></tr>`
		: ''
}
<tr><td align="center" style="padding:0 28px 24px;color:#8a9386;font-size:12px;line-height:1.5">${withCode ? "Didn't ask for a code? You can ignore this email.<br>" : ''}
Sprig · <a href="${esc(site)}" style="color:#6b8f3a">${esc(host)}</a> · <a href="mailto:hello@sprig-family.com" style="color:#6b8f3a">hello@sprig-family.com</a></td></tr>
</table></td></tr></table></body></html>`;
	return { subject, html, text };
}
