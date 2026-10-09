import { useEffect, useSyncExternalStore } from 'react';

/** Below this (and not charging), the screen is left to sleep as usual. */
const LOW_BATTERY = 0.2;

interface Battery extends EventTarget { level: number; charging: boolean }

/**
 * The backup when the wake lock isn't held: a tiny silent video kept playing. An iPad stays awake
 * while a video plays, but not a looping one (so a page can't keep it awake by accident), so this
 * one jumps back to the start instead of looping. NoSleep.js does the same.
 */
let video: HTMLVideoElement | null = null;
let videoWanted = false;
function keepAwakeVideo(on: boolean) {
  videoWanted = on;
  if (!on) return void video?.pause();
  if (!video) {
    video = document.createElement('video');
    Object.assign(video, { muted: true, playsInline: true, src: '/keep-awake.mp4' });
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    // On the page, all but out of sight: an iPad pauses a video it thinks can't be seen (opacity 0).
    Object.assign(video.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none', bottom: '0', left: '0' });
    video.addEventListener('timeupdate', () => video!.currentTime > 1 && (video!.currentTime = 0));
    document.body.append(video);
  }
  // A muted video may start without a tap (not in Low Power Mode); a tap tries again.
  void video.play().catch(() => {});
}

/** An iPad or iPhone (iPads say "Macintosh", but a Mac has no touch screen). */
const APPLE_TOUCH = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// An iPad only reliably starts a video from a tap: so every tap starts it (again), right in the tap.
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => videoWanted && video?.paused && void video.play().catch(() => {}), true);
}

/** How keeping the screen on is going, for Settings. */
export type WakeStatus = 'on' | 'off' | 'low-battery' | 'needs-https' | 'unsupported' | 'refused';
let status: WakeStatus = 'off';
let reason = '';
const listeners = new Set<() => void>();
function setStatus(next: WakeStatus, why = '') {
  status = next;
  reason = why;
  // Not held (refused, no support, no https): the video keeps it awake instead. On an iPad or
  // iPhone always, even when the lock says yes: in a home-screen app (before iPadOS 18.4) it agrees
  // but doesn't keep the screen on. Not when the battery's low or it isn't wanted.
  keepAwakeVideo(next !== 'off' && next !== 'low-battery' && (next !== 'on' || APPLE_TOUCH));
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
    if (!window.isSecureContext || !('wakeLock' in navigator)) {
      // No wake lock here: just the video, started again on a tap if it was stopped.
      const why = window.isSecureContext ? 'unsupported' : 'needs-https';
      setStatus(why);
      const retry = () => setStatus(why);
      document.addEventListener('pointerdown', retry);
      return () => {
        document.removeEventListener('pointerdown', retry);
        setStatus('off');
      };
    }
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
