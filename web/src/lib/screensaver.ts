import type { ScreenSaverSettings } from './types';

export const SCREEN_SAVER_DEFAULTS: ScreenSaverSettings = {
  enabled: true,
  idleMinutes: 2,
  seconds: 20,
  transition: 'mix',
  night: true,
  nightFrom: '22:00',
  nightTo: '06:00',
  showEvents: true,
};

/** Whether `now` is in the night hours (which can run past midnight, e.g. 22:00 to 06:00). */
export function isNight(s: { night: boolean; nightFrom: string; nightTo: string }, now = new Date()) {
  if (!s.night) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const mins = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const from = mins(s.nightFrom);
  const to = mins(s.nightTo);
  return from <= to ? t >= from && t < to : t >= from || t < to;
}

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
