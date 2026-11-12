import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Corners and plain drop shadows use the shared scale in app.css (see README.md here). A value of its
// own is fine when it says why, in a comment on the line or the line before: /* own: over a photo */.

// Type-checked with the server's settings (tsconfig.json), as it reads files.
const dir = import.meta.dirname;
/** Every stylesheet but app.css (where the scale is set): its file name and text. */
const sheets = readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'app.css')
  .map((f) => [f, readFileSync(join(dir, f), 'utf8')] as const);

/** Each declaration of `property` (by regex) that isn't marked as its own: "File.module.css:12  value". */
function unscaled(property: RegExp, raw: (value: string) => boolean) {
  const found: string[] = [];
  for (const [file, text] of sheets) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(new RegExp(`(?:^|[\\s;{])${property.source}\\s*:\\s*([^;}]+)`, 'g'))) {
        const value = m[1].trim();
        if (raw(value) && !/\/\*\s*own:/.test(line) && !/\/\*\s*own:/.test(lines[i - 1] ?? '')) found.push(`${file}:${i + 1}  ${value}`);
      }
    });
  }
  return found;
}

describe('the style scale', () => {
  it('corners use --radius-*', () => {
    // A length in rem or px; 0, a circle's 50%, an em that grows with its text and inherit are fine.
    expect(unscaled(/border(?:-[a-z]+)*-radius/, (v) => /(?:^|\s)(?!0(?:\s|$))[\d.]+(?:rem|px)\b/.test(v))).toEqual([]);
  });

  it('plain drop shadows use --shadow-*', () => {
    // One layer, straight down, in black or the text's near-black. Rings, insets, tints and more than
    // one layer are their own thing.
    expect(unscaled(/box-shadow/, (v) => /^0 [\d.]+(?:rem|px) [\d.]+(?:rem|px) rgb\((?:0 0 0|29 31 35) \/ [\d.]+\)$/.test(v))).toEqual([]);
  });
});
