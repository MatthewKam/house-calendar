import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Corners and plain drop shadows use the shared scale in app.css (see README.md here). A value of its
// own is fine when it says why, in a comment on the line or the line before: /* own: over a photo */.
//
// Text sizes, weights, spacing and colours have shared names too, but older stylesheets still have values
// of their own. Those are counted per file in scale-baseline.json, and a file may only ever have fewer:
// a new file starts at none. Moving a file to the shared names, lower its numbers with
//   UPDATE_SCALE=1 npx vitest run web/src/styles/scale.test.ts

// Type-checked with the server's settings (tsconfig.json), as it reads files.
const src = join(import.meta.dirname, '..');
const BASELINE = join(import.meta.dirname, 'scale-baseline.json');
/** Every stylesheet in web/src but app.css (where the scale is set): its path and text. */
const sheets = (readdirSync(src, { recursive: true }) as string[])
	.filter((f) => f.endsWith('.css') && f !== join('styles', 'app.css'))
	.sort()
	.map((f) => [f, readFileSync(join(src, f), 'utf8')] as const);

/** Each declaration of `property` (by regex) that isn't marked as its own: "components/tasks/styles/Tasks.module.css:12  value". */
function unscaled(property: RegExp, raw: (value: string) => boolean) {
	const found: string[] = [];
	for (const [file, text] of sheets) {
		const lines = text.split('\n');
		lines.forEach((line, i) => {
			for (const m of line.matchAll(new RegExp(`(?:^|[\\s;{])(?:${property.source})\\s*:\\s*([^;}]+)`, 'g'))) {
				const value = m[1].trim();
				if (raw(value) && !/\/\*\s*own:/.test(line) && !/\/\*\s*own:/.test(lines[i - 1] ?? ''))
					found.push(`${file}:${i + 1}  ${value}`);
			}
		});
	}
	return found;
}

/** A length that isn't nothing: 0.5rem, 12px (not 0, an em, a %, or a shared name). */
const length = (v: string) => [...v.matchAll(/(?<![\w.-])-?([\d.]+)(?:rem|px)\b/g)].some((m) => Number(m[1]) !== 0);

/** The kinds still on their way to the shared names, and what counts as a value of their own. */
const KINDS = {
	'text size (--text-*)': unscaled(/font-size/, length),
	'weight (--weight-*)': unscaled(/font-weight/, (v) => /^(\d+|bold|bolder|lighter)$/.test(v)),
	'spacing (--space-*)': unscaled(/(?:padding|margin)(?:-[a-z]+)*|(?:row-|column-)?gap/, length),
	// Any property but a variable's own definition (a person's --c, a game piece's --pc).
	'colour (--text, --accent, …)': unscaled(/[a-z][a-z-]*/, (v) =>
		/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*\d/.test(v),
	),
};
type Counts = Record<string, Record<string, number>>;

/** How many each file has, by kind. */
function counts(): Counts {
	const out: Counts = {};
	for (const [kind, found] of Object.entries(KINDS)) {
		out[kind] = {};
		for (const f of found) {
			const file = f.slice(0, f.indexOf(':'));
			out[kind][file] = (out[kind][file] ?? 0) + 1;
		}
	}
	return out;
}

describe('the style scale', () => {
	it('corners use --radius-*', () => {
		// A length in rem or px; 0, a circle's 50%, an em that grows with its text and inherit are fine.
		expect(unscaled(/border(?:-[a-z]+)*-radius/, (v) => /(?:^|\s)(?!0(?:\s|$))[\d.]+(?:rem|px)\b/.test(v))).toEqual([]);
	});

	it('plain drop shadows use --shadow-*', () => {
		// One layer, straight down, in black or the text's near-black. Rings, insets, tints and more than
		// one layer are their own thing.
		expect(
			unscaled(/box-shadow/, (v) =>
				/^0 [\d.]+(?:rem|px) [\d.]+(?:rem|px) rgb\((?:0 0 0|29 31 35) \/ [\d.]+\)$/.test(v),
			),
		).toEqual([]);
	});

	it('text sizes, weights, spacing and colours never gain values of their own', () => {
		const now = counts();
		if (process.env.UPDATE_SCALE) {
			writeFileSync(BASELINE, JSON.stringify(now, null, '\t') + '\n');
			return;
		}
		const before = JSON.parse(readFileSync(BASELINE, 'utf8')) as Counts;
		// For each file with more than before: its values of its own of that kind, to use shared names for.
		const more: string[] = [];
		for (const [kind, files] of Object.entries(now)) {
			for (const [file, n] of Object.entries(files)) {
				const was = before[kind]?.[file] ?? 0;
				if (n > was)
					more.push(
						`${kind}: ${file} has ${n}, was ${was}`,
						...KINDS[kind as keyof typeof KINDS].filter((f) => f.startsWith(`${file}:`)).map((f) => `  ${f}`),
					);
			}
		}
		expect(more).toEqual([]);
	});
});
