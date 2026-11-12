import { describe, expect, it } from 'vitest';
import { ACCENTS, DEFAULT_ACCENT, accentCss } from './accent';

/** WCAG contrast between two #rrggbb colors. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// app.css's surfaces.
const PAGE = { light: '#ffffff', dark: '#1e2024' };

describe('accent colors', () => {
  it('starts on Sprig green, as app.css has it', () => {
    expect(DEFAULT_ACCENT).toMatchObject({ id: 'sprig', light: { accent: '#146c43' }, dark: { accent: '#258f5c' } });
  });

  // Sprig green's dark shade is the app's from before (about 4 to 1); every pick added since reads at 4.5 or better.
  it.each(ACCENTS.filter((a) => a !== DEFAULT_ACCENT).map((a) => [a.name, a] as const))(
    '%s reads well on the page and under its text, light and dark', (_name, a) => {
      for (const mode of ['light', 'dark'] as const) {
        expect(contrast(a[mode].accent, PAGE[mode])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(a[mode].on, a[mode].accent)).toBeGreaterThanOrEqual(4.5);
      }
    });

  it('gives dark mode its own shade (charcoal is not black on a dark page)', () => {
    const charcoal = ACCENTS.find((a) => a.id === 'charcoal')!;
    expect(accentCss(charcoal)).toContain('[data-theme="dark"][data-theme]{--accent:#d4d6da;--on-accent:#1d1f23;}');
  });
});
