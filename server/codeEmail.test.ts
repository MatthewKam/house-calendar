import { describe, expect, it } from 'vitest';
import { codeEmail, GROWTH_QUOTES, quoteFor } from './codeEmail.ts';

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

	it('changes the quote each day, going round them all', () => {
		const days = GROWTH_QUOTES.map((_, i) => quoteFor(new Date(Date.UTC(2026, 10, 16 + i, 12))));
		expect(new Set(days).size).toBe(GROWTH_QUOTES.length);
	});
});
