import { useSyncExternalStore } from 'react';

// The screen sizes, the same as the CSS's (listed at the top of styles/app.css).

/** Phone-sized screens: the bar along the bottom. */
export const PHONE = '(max-width: 700px)';
/** A phone on its side: too wide for PHONE, too short for the tablet bar. */
export const PHONE_SIDEWAYS = '(orientation: landscape) and (max-height: 500px)';
/** Phones and tablets upright: no room for the week's cards beside the calendar. */
export const NARROW = '(max-width: 959.98px)';
/** An iPad either way up, and bigger. */
export const TABLET = '(min-width: 744px) and (min-height: 600px)';
/** A big screen. */
export const WIDE = '(min-width: 1401px)';
/** A tablet on its side, or bigger: room for two columns of cards. */
export const LANDSCAPE_TABLET = '(orientation: landscape) and (min-width: 1000px)';

/** Whether a CSS media query matches, updating when the window is resized or rotated. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
