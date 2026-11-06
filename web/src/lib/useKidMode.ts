import { useState } from 'react';

/** Kid mode on this device: one kid's id, or "all" (a shared tablet, switching between kids). */
export type KidModeFor = string | 'all';

const KEY = 'sprig:kid-mode';

function load(): KidModeFor | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Kid mode turned on for this device by a parent (a kid's own device is always in it, see App). Kept
 * on the device, so a refresh stays in it; without storage it lasts until the page reloads.
 */
export function useKidMode() {
  const [on, setOn] = useState<KidModeFor | null>(load);
  const set = (next: KidModeFor | null) => {
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      // Private browsing or storage blocked: just this visit.
    }
    setOn(next);
  };
  return [on, set] as const;
}
