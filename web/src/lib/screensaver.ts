import type { ScreenSaverSettings } from './types';

export const SCREEN_SAVER_DEFAULTS: ScreenSaverSettings = {
  enabled: true,
  idleMinutes: 15,
  seconds: 20,
  transition: 'mix',
};

export const TRANSITIONS: { id: ScreenSaverSettings['transition']; label: string }[] = [
  { id: 'mix', label: 'A mix of all' },
  { id: 'fade', label: 'Crossfade' },
  { id: 'kenburns', label: 'Slow zoom and pan' },
  { id: 'slide', label: 'Slide' },
  { id: 'zoom', label: 'Zoom out' },
  { id: 'blur', label: 'Blur dissolve' },
  { id: 'flip', label: 'Flip' },
];

/** The saved setting, with defaults for anything missing. */
export const screenSaverSettings = (saved: unknown): ScreenSaverSettings => ({
  ...SCREEN_SAVER_DEFAULTS,
  ...(saved && typeof saved === 'object' ? (saved as Partial<ScreenSaverSettings>) : {}),
});
