import { useSyncExternalStore } from 'react';

/** Phone-sized screens; matches the 700px breakpoint in the CSS. */
export const PHONE = '(max-width: 700px)';

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
