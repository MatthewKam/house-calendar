import { useEffect, useState } from 'react';
import { usePhotos, useSettings } from './queries';
import { screenSaverSettings } from './screensaver';

/**
 * The photo screen saver: on after the wall has been idle for the set time (any touch, mouse
 * movement or key starts the count over). If a pop-up is open when time runs out, it waits another
 * minute rather than covering what someone was doing. `show` starts it now (Play it now).
 */
export function useScreenSaver() {
  const settings = screenSaverSettings(useSettings().data?.screensaver);
  // The photos picked for it (on the Photos page).
  const photos = (usePhotos().data ?? []).filter((p) => p.inSlideshow);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!settings.enabled || photos.length === 0) return;
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
  }, [settings.enabled, settings.idleMinutes, photos.length]);

  return { on: on && photos.length > 0, photos, settings, show: () => setOn(true), hide: () => setOn(false) };
}
