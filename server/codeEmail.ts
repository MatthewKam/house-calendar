// The email with a code in it: to sign in, or to set a new PIN (identity.ts sends it). Sprig waving at
// the top, the code big, and a quote to grow on, a different one each day. Plain text goes along with it.

/** What the code is for. */
export type CodeFor = 'sign-in' | 'pin';

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
	const what = purpose === 'pin' ? 'set a new PIN' : 'sign in';
	const subject = purpose === 'pin' ? `${code} is your Sprig PIN code` : `${code} is your Sprig code`;
	const host = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
	const text = [
		`Hi! Here's your code to ${what}: ${code}`,
		'It works for 10 minutes.',
		'',
		`Something to grow on: "${quote.text}" (${quote.by})`,
		'',
		"Didn't ask for a code? You can ignore this email.",
		`Sprig · ${site} · hello@sprig-family.com`,
	].join('\n');
	// Tables and inline styles: what email apps show alike.
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:20px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1f2a1c">
<tr><td align="center" style="padding:28px 28px 0"><img src="${esc(site)}/mascot/sprig-email.png" width="120" alt="Sprig, waving" style="display:block;width:120px;height:auto"></td></tr>
<tr><td align="center" style="padding:12px 28px 0"><h1 style="margin:0;font-size:22px">Hi! Here's your code</h1>
<p style="margin:8px 0 0;color:#5b6657;font-size:15px">Type it into Sprig to ${what}.</p></td></tr>
<tr><td align="center" style="padding:20px 28px"><div style="display:inline-block;padding:14px 22px;border-radius:14px;background:#eef7e6;font-size:34px;font-weight:700;letter-spacing:8px;font-family:Menlo,Consolas,monospace;color:#2f6b3a">${esc(code)}</div>
<p style="margin:10px 0 0;color:#5b6657;font-size:13px">It works for 10 minutes.</p></td></tr>
<tr><td style="padding:0 28px 24px"><div style="border-left:4px solid #8cc63f;background:#f7faf3;border-radius:10px;padding:14px 16px">
<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#6b8f3a;font-weight:700">🌱 Something to grow on</div>
<p style="margin:6px 0 0;font-size:16px;line-height:1.4">“${esc(quote.text)}”</p>
<p style="margin:4px 0 0;font-size:13px;color:#5b6657">${esc(quote.by)}</p></div></td></tr>
<tr><td align="center" style="padding:0 28px 24px;color:#8a9386;font-size:12px;line-height:1.5">Didn't ask for a code? You can ignore this email.<br>
Sprig · <a href="${esc(site)}" style="color:#6b8f3a">${esc(host)}</a> · <a href="mailto:hello@sprig-family.com" style="color:#6b8f3a">hello@sprig-family.com</a></td></tr>
</table></td></tr></table></body></html>`;
	return { subject, html, text };
}
