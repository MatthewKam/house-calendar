import { useEffect, useState } from 'react';

/**
 * Where this device is, for its weather (Today's Home or Here): null is home. Kept on the device, so a
 * parent travelling alone sees where they are while the rest of the family still sees home. Everything
 * on this device that shows the weather follows it, kid mode's What to wear too. Rounded to about a
 * kilometre, and only ever sent for the forecast.
 */
export interface Here { lat: number; lon: number }

const KEY = 'sprig:weather-here';
/** Looked up again (when Here is on) at most this often. */
const REFRESH_MS = 20 * 60_000;
let lastLook = 0;

const round = (n: number) => Math.round(n * 100) / 100;

function load(): Here | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return typeof saved?.lat === 'number' && typeof saved?.lon === 'number' ? saved : null;
  } catch {
    return null;
  }
}

function save(here: Here | null) {
  try {
    if (here) localStorage.setItem(KEY, JSON.stringify(here));
    else localStorage.removeItem(KEY);
  } catch {
    // Private browsing or storage blocked: just this visit.
  }
  window.dispatchEvent(new Event(KEY));
}

/** The device can tell where it is: a browser with location, on https (or this computer). */
export const canFindHere = () => typeof navigator !== 'undefined' && !!navigator.geolocation && window.isSecureContext;

/** Asks the device where it is (it asks permission the first time). */
export function findHere(): Promise<Here> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lon: round(p.coords.longitude) }),
      reject,
      { enableHighAccuracy: false, maximumAge: REFRESH_MS, timeout: 15_000 },
    );
  });
}

/** Switches this device to where it is (after finding it), or back home (null). */
export const setHere = save;

/** Where this device's weather is for (null: home), kept fresh while it's on Here. */
export function useWeatherHere() {
  const [here, setState] = useState<Here | null>(load);
  useEffect(() => {
    const update = () => setState(load());
    window.addEventListener(KEY, update);
    return () => window.removeEventListener(KEY, update);
  }, []);
  // On Here: moved since? Looked up again now and then (not on every screen that shows the weather).
  useEffect(() => {
    if (!here || !canFindHere() || Date.now() - lastLook < REFRESH_MS) return;
    lastLook = Date.now();
    findHere().then((now) => {
      if (now.lat !== here.lat || now.lon !== here.lon) save(now);
    }, () => {});
  }, [here]);
  return here;
}
