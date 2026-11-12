import { useEffect, useState } from 'react';
import { usePhotos } from './queries';
import { useScreenSaverSettings } from './useScreenSaverSettings';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from './useMediaQuery';

/**
 * The photo screen saver: on after the screen has been idle for the set time (any touch, mouse
 * movement or key starts the count over), on tablets and computers, never by itself on a phone. If a
 * pop-up is open when time runs out, it waits another minute rather than covering what someone was
 * doing. `show` starts it now (Play it now, the slideshow), phones too.
 */
export function useScreenSaver() {
  const [settings] = useScreenSaverSettings();
  // Both asked every time (hooks can't be skipped).
  const upright = useMediaQuery(PHONE);
  const sideways = useMediaQuery(PHONE_SIDEWAYS);
  const phone = upright || sideways;
  // The photos and videos picked for it (on the Photos page), once ready.
  const photos = (usePhotos().data ?? []).filter((p) => p.inSlideshow && p.ready);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!settings.enabled || phone || photos.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const fire = () => {
      if (document.querySelector('[class*="_scrim_"], [role="dialog"]')) {
        timer = setTimeout(fire, 60_000);
        return;
      }
      setOn(true);
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(fire, settings.idleMinutes * 60_000);
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [settings.enabled, settings.idleMinutes, phone, photos.length]);

  return { on: on && photos.length > 0, photos, settings, show: () => setOn(true), hide: () => setOn(false) };
}
