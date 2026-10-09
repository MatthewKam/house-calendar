import { useEffect, useSyncExternalStore } from 'react';

/** Below this (and not charging), the screen is left to sleep as usual. */
const LOW_BATTERY = 0.2;

interface Battery extends EventTarget { level: number; charging: boolean }

/** How keeping the screen on is going, for Settings. */
export type WakeStatus = 'on' | 'off' | 'low-battery' | 'needs-https' | 'unsupported' | 'refused';
let status: WakeStatus = 'off';
let reason = '';
const listeners = new Set<() => void>();
function setStatus(next: WakeStatus, why = '') {
  status = next;
  reason = why;
  listeners.forEach((l) => l());
}
/** Whether the screen is being kept on (and if not, why), updating as it changes. */
export function useWakeStatus() {
  const s = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => status);
  return { status: s, reason };
}

/**
 * Keeps the screen on while `active` (the wall is open with the screen saver turned on), so the
 * screen saver can take over instead of the device sleeping. Uses the browser's Screen Wake Lock
 * (Safari 16.4 and later, Chrome), which needs an HTTPS page. Safari may refuse a request no one
 * tapped for, so it's asked for again on any tap whenever it isn't held; the browser also lets it
 * go while the page is hidden. Not when the battery is low: Chrome says how full it is (let go
 * below 20% unless charging); on an iPad, iPadOS refuses it in Low Power Mode.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return setStatus('off');
    if (!window.isSecureContext) return setStatus('needs-https');
    if (!('wakeLock' in navigator)) return setStatus('unsupported');
    let lock: WakeLockSentinel | null = null;
    let battery: Battery | null = null;
    let stopped = false;
    let asking = false;
    const low = () => !!battery && !battery.charging && battery.level <= LOW_BATTERY;

    async function update() {
      if (stopped || asking) return;
      if (low() || document.visibilityState !== 'visible') {
        const mine = lock;
        lock = null;
        await mine?.release().catch(() => {});
        if (low()) setStatus('low-battery');
        return;
      }
      if (lock && !lock.released) return;
      asking = true;
      try {
        const got = await navigator.wakeLock.request('screen');
        lock = got;
        setStatus('on');
        // Let go by the system (Low Power Mode, say), not by us: asked for again on the next tap.
        got.addEventListener('release', () => !stopped && lock === got && setStatus('refused', 'let go by the device'));
      } catch (err) {
        lock = null;
        setStatus('refused', err instanceof Error ? err.message : String(err));
      } finally {
        asking = false;
      }
    }

    void (async () => {
      const getBattery = (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery;
      battery = getBattery ? await getBattery.call(navigator).catch(() => null) : null;
      battery?.addEventListener('levelchange', update);
      battery?.addEventListener('chargingchange', update);
      await update();
    })();
    // A tap is the surest time to ask (Safari can refuse otherwise).
    const events = ['visibilitychange', 'pointerdown', 'keydown'] as const;
    events.forEach((e) => document.addEventListener(e, update));
    return () => {
      stopped = true;
      const mine = lock;
      lock = null;
      events.forEach((e) => document.removeEventListener(e, update));
      battery?.removeEventListener('levelchange', update);
      battery?.removeEventListener('chargingchange', update);
      void mine?.release().catch(() => {});
      setStatus('off');
    };
  }, [active]);
}
