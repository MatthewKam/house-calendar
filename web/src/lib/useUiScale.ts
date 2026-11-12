import { useEffect, useState } from 'react';

/**
 * How big the text is on this device (Settings, Appearance): kept on the device, like light or dark, so
 * the wall's big text doesn't make the phones' big too. Until it's set here, the household's old shared
 * setting (from before it was per device), then 100%.
 */
const KEY = 'sprig:ui-scale';

function load(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function useUiScale(household?: unknown) {
  const [mine, setMine] = useState(load);
  useEffect(() => {
    const update = () => setMine(load());
    window.addEventListener(KEY, update);
    return () => window.removeEventListener(KEY, update);
  }, []);
  const set = (next: number) => {
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // Private browsing or storage blocked: just this visit.
    }
    setMine(next);
    window.dispatchEvent(new Event(KEY));
  };
  return [mine ?? (typeof household === 'number' ? household : 1), set] as const;
}
