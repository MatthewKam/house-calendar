import { describe, expect, it } from 'vitest';
import { CONSENT_NOTICE, codeEmail, GROWTH_QUOTES, quoteFor } from './codeEmail.ts';

describe('the code email', () => {
	it('has the code, Sprig, and the day’s quote, for signing in or a new PIN', () => {
		const day = new Date('2026-11-16T12:00:00Z');
		const mail = codeEmail('482913', 'sign-in', 'https://sprig-family.com', day);
		expect(mail.subject).toBe('482913 is your Sprig code');
		expect(mail.html).toContain('>482913</div>');
		expect(mail.html).toContain('src="https://sprig-family.com/mascot/sprig-email.png"');
		expect(mail.html).toContain('to sign in.');
		expect(mail.text).toContain(`"${quoteFor(day).text}"`);
		expect(mail.text).not.toContain('Household');

		const pin = codeEmail('000123', 'pin', 'https://sprig-family.com', day);
		expect(pin.subject).toBe('000123 is your Sprig PIN code');
		expect(pin.text).toContain("Here's your code to set a new PIN: 000123");
	});

	it("tells a guardian what's kept about children with the consent code, and confirms it after", () => {
		const day = new Date('2026-11-27T12:00:00Z');
		const ask = codeEmail('482913', 'consent', 'https://sprig-family.com', day);
		expect(ask.subject).toBe('482913: your consent for your children in Sprig');
		expect(ask.text).toContain("Here's your code to give your consent: 482913");
		for (const p of CONSENT_NOTICE) expect(ask.text).toContain(p);
		expect(ask.html).toContain('https://sprig-family.com/privacy#children');
		expect(ask.text).toContain('Tayno');

		const done = codeEmail('', 'consented', 'https://sprig-family.com', day);
		expect(done.subject).toBe("You've given consent for your children in Sprig");
		expect(done.text).toContain('Take back');
		expect(done.text).not.toContain('code');
		expect(done.html).not.toContain('letter-spacing:8px');
	});

	it('changes the quote each day, going round them all', () => {
		const days = GROWTH_QUOTES.map((_, i) => quoteFor(new Date(Date.UTC(2026, 10, 16 + i, 12))));
		expect(new Set(days).size).toBe(GROWTH_QUOTES.length);
	});
});
