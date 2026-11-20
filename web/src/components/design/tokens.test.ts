import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readTokens } from './tokens.ts';

// Read with Node (in tests, a stylesheet imported as ?raw comes through empty).
const css = readFileSync(join(import.meta.dirname, '../../styles/app.css'), 'utf8');

describe('the design page reads app.css', () => {
	const tokens = readTokens(css);
	const find = (name: string) => tokens.find((t) => t.name === name);

	it('finds every set, each name once', () => {
		const groups = new Set(tokens.map((t) => t.group));
		expect([...groups].sort()).toEqual(
			['colour', 'layer', 'leading', 'radius', 'shadow', 'space', 'tap', 'text', 'weight'].sort(),
		);
		expect(new Set(tokens.map((t) => t.name)).size).toBe(tokens.length);
		expect(tokens.filter((t) => t.group === 'space')).toHaveLength(8);
	});

	it("keeps each name's own note, and a colour set's shared one", () => {
		expect(find('--space-3')).toMatchObject({ value: '0.6rem', note: expect.stringContaining('between rows') });
		expect(find('--danger-bg')?.note).toMatch(/^Something wrong/);
		// The light value, not the dark one written later.
		expect(find('--bg')?.value).toBe('#f6f5f2');
	});

	it("leaves out what isn't picked from", () => {
		expect(find('--top-room')).toBeUndefined();
		expect(find('--pastel')).toBeUndefined();
	});
});
