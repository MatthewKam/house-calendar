import { useEffect, useState } from 'react';

/**
 * Light or dark, for this device: "auto" follows the device's own setting. Kept on the device (a wall in
 * the kitchen and a phone at night want different things). index.html reads the same key before the
 * first paint, so the page doesn't flash light first.
 */
export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'sprig:theme';
const DARK = '(prefers-color-scheme: dark)';
/** The browser's bar and the strip behind a phone's clock: the surface color (app.css). */
const BAR = { light: '#ffffff', dark: '#1e2024' };

function load(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

/** This device's pick, and changing it. */
export function useThemeSetting() {
  const [theme, setTheme] = useState<Theme>(load);
  const set = (next: Theme) => {
    try {
      if (next === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private browsing or storage blocked: just this visit.
    }
    setTheme(next);
    window.dispatchEvent(new Event(KEY));
  };
  return [theme, set] as const;
}

/**
 * Puts the theme on the page (data-theme, which app.css's colors follow), and keeps it there as the
 * setting or the device's own setting changes. lightOnly: kid mode, whose pictures and games are made
 * bright, stays light.
 */
export function useTheme(lightOnly: boolean) {
  useEffect(() => {
    const media = window.matchMedia(DARK);
    const apply = () => {
      const pick = load();
      const mode = lightOnly ? 'light' : pick === 'auto' ? (media.matches ? 'dark' : 'light') : pick;
      document.documentElement.dataset.theme = mode;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[mode]);
    };
    apply();
    media.addEventListener('change', apply);
    window.addEventListener(KEY, apply);
    return () => {
      media.removeEventListener('change', apply);
      window.removeEventListener(KEY, apply);
    };
  }, [lightOnly]);
}
