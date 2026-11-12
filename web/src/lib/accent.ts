import { useEffect, useState } from 'react';

/**
 * The accent: buttons and highlights. Picked per device from a few set options (a color picker may come
 * later), each with its own shade for light and for dark, and the color of text on it, so every pick
 * reads well in both (charcoal is near black on light, light grey on dark). Sprig green is app.css's own,
 * the default. Kept on the device, like light or dark; index.html puts the pick on before the first paint.
 */
export interface Accent {
  id: string;
  name: string;
  light: { accent: string; on: string };
  dark: { accent: string; on: string };
}

export const ACCENTS: Accent[] = [
  { id: 'sprig', name: 'Sprig green', light: { accent: '#146c43', on: '#ffffff' }, dark: { accent: '#258f5c', on: '#ffffff' } },
  { id: 'blue', name: 'Blue', light: { accent: '#1f5fbf', on: '#ffffff' }, dark: { accent: '#6ea8f5', on: '#0d1b2e' } },
  { id: 'purple', name: 'Purple', light: { accent: '#6a3fb5', on: '#ffffff' }, dark: { accent: '#b39af0', on: '#1f1435' } },
  { id: 'berry', name: 'Berry', light: { accent: '#b3245e', on: '#ffffff' }, dark: { accent: '#f28cb4', on: '#33101f' } },
  { id: 'charcoal', name: 'Charcoal', light: { accent: '#1d1f23', on: '#ffffff' }, dark: { accent: '#d4d6da', on: '#1d1f23' } },
];
export const DEFAULT_ACCENT = ACCENTS[0];

const KEY = 'sprig:accent';
/** The pick as CSS, for index.html to put on before the first paint. */
const CSS_KEY = 'sprig:accent-css';
const STYLE_ID = 'sprig-accent';

const accentOf = (id: string | null) => ACCENTS.find((a) => a.id === id) ?? DEFAULT_ACCENT;

function load() {
  try {
    return accentOf(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_ACCENT;
  }
}

/**
 * The pick's colors over app.css's, for light (kid mode too) and dark. Doubled selectors: app.css loads
 * after index.html's copy of this, so these have to outweigh its, not just come later.
 */
export function accentCss(a: Accent) {
  const vars = (m: Accent['light']) => `--accent:${m.accent};--on-accent:${m.on};`;
  return `:root:root,[data-theme="light"][data-theme]{${vars(a.light)}}[data-theme="dark"][data-theme]{${vars(a.dark)}}`;
}

/** Puts the pick on the page (nothing for Sprig green: app.css has it). */
function apply(a: Accent) {
  let style = document.getElementById(STYLE_ID);
  if (a === DEFAULT_ACCENT) return style?.remove();
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = accentCss(a);
}

/** This device's accent, and changing it. */
export function useAccentSetting() {
  const [accent, setAccent] = useState(load);
  useEffect(() => {
    const update = () => setAccent(load());
    window.addEventListener(KEY, update);
    return () => window.removeEventListener(KEY, update);
  }, []);
  const set = (next: Accent) => {
    try {
      if (next === DEFAULT_ACCENT) {
        localStorage.removeItem(KEY);
        localStorage.removeItem(CSS_KEY);
      } else {
        localStorage.setItem(KEY, next.id);
        localStorage.setItem(CSS_KEY, accentCss(next));
      }
    } catch {
      // Private browsing or storage blocked: just this visit.
    }
    apply(next);
    window.dispatchEvent(new Event(KEY));
  };
  return [accent, set] as const;
}

/** Keeps this device's accent on the page (index.html put it on first; this catches a stale copy). */
export function useAccent() {
  useEffect(() => apply(load()), []);
}
