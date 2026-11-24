import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The shared components (styles/README.md "Components") are the one way to make a box to type in, a
// pick from a list, or a button's look. Older code still has its own, counted per file in
// usage-baseline.json, and a file may only ever have fewer: a new file starts at none. Moving a file
// over, lower its numbers with
//   UPDATE_USAGE=1 npx vitest run web/src/styles/usage.test.ts
//
// What's counted, and what to use instead:
// - a raw <input> to type in (any but a checkbox, radio, file, colour, range or hidden one), <select> or
//   <textarea>: Input, Select or TextArea (in a Field), or DateInput for a date
// - a Sheet's own button looks (sheet.primary, .secondary, .danger, .destructive): Button's variants
// - the old text buttons and icon spans from Buttons.module.css (composes: textButton, quiet or
//   withIcon; buttons.buttonIcon and .buttonText): Button's link and quiet variants and its icon

// Type-checked with the server's settings (tsconfig.json), as it reads files.
const src = join(import.meta.dirname, '..');
const BASELINE = join(import.meta.dirname, 'usage-baseline.json');

/** Every .tsx and .css in web/src but the shared components themselves: its path and text. */
const files = (readdirSync(src, { recursive: true }) as string[])
	.filter((f) => /\.(tsx|css)$/.test(f) && !f.startsWith(join('components', 'ui', 'styles', 'Buttons.module.css')))
	.filter((f) => !/components[/\\]ui[/\\](Button|Field|Chip|Card|ListRow|Segmented|DateInput)\./.test(f))
	.filter((f) => !f.startsWith(join('components', 'design')))
	.sort()
	.map((f) => [f, readFileSync(join(src, f), 'utf8')] as const);

const OWN_INPUT = /\btype=["'](checkbox|radio|file|color|range|hidden)["']/;

/** How many of each kind a file has. */
const KINDS: Record<string, (file: string, text: string) => number> = {
	'raw box (Input, Select, TextArea)': (file, text) =>
		file.endsWith('.tsx')
			? [...text.matchAll(/<(input|select|textarea)\b((?:[^>"{]|"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})*)>/gs)].filter(
					(m) => m[1] !== 'input' || !OWN_INPUT.test(m[2]),
				).length
			: 0,
	"Sheet's button looks (Button)": (file, text) =>
		file.endsWith('.tsx') ? [...text.matchAll(/\bsheet\.(primary|secondary|danger|destructive)\b/g)].length : 0,
	'old text buttons and icon spans (Button)': (_file, text) =>
		[...text.matchAll(/composes:\s*(textButton|quiet|withIcon)\b|\bbuttons\.button(Icon|Text)\b/g)].length,
};
type Counts = Record<string, Record<string, number>>;

function counts(): Counts {
	const out: Counts = {};
	for (const [kind, count] of Object.entries(KINDS)) {
		out[kind] = {};
		for (const [file, text] of files) {
			const n = count(file, text);
			if (n) out[kind][file] = n;
		}
	}
	return out;
}

describe('the shared components', () => {
	it('are used instead of boxes and button looks of their own (only ever fewer)', () => {
		const now = counts();
		if (process.env.UPDATE_USAGE) {
			writeFileSync(BASELINE, JSON.stringify(now, null, '\t') + '\n');
			return;
		}
		const before = JSON.parse(readFileSync(BASELINE, 'utf8')) as Counts;
		const more: string[] = [];
		for (const [kind, byFile] of Object.entries(now))
			for (const [file, n] of Object.entries(byFile)) {
				const was = before[kind]?.[file] ?? 0;
				if (n > was) more.push(`${kind}: ${file} has ${n}, was ${was}`);
			}
		expect(more).toEqual([]);
	});
});
