import { useSetSetting, useSettings } from '../lib/queries';
import { screenSaverSettings, TRANSITIONS } from '../lib/screensaver';
import type { ScreenSaverSettings as Settings } from '../lib/types';
import { useWakeStatus, type WakeStatus } from '../lib/useWakeLock';
import s from '../styles/MembersPanel.module.css';

/** Minutes without a touch before it starts. */
/** Whether this device's screen is being kept on, in words. */
const WAKE: Record<WakeStatus, string> = {
  on: 'This screen stays on, so the screen saver takes over instead of it sleeping.',
  off: 'This screen may sleep (the screen saver is off, or no photos are picked for it).',
  'low-battery': 'The battery is low, so this screen may sleep.',
  'needs-https': "This screen may sleep: keeping it on needs the wall's https:// address.",
  unsupported: "This screen may sleep: this browser can't keep it on (an iPad needs iPadOS 16.4 or later).",
  refused: 'This screen may sleep: the device said no',
};

const IDLE: [number, string][] = [[0.5, '30 seconds'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'],
  [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']];
const SECONDS: [number, string][] = [[10, '10 seconds'], [20, '20 seconds'], [30, '30 seconds'], [60, '1 minute'],
  [120, '2 minutes'], [300, '5 minutes'], [1200, '20 minutes']];

/**
 * Settings for the photo screen saver (in Settings, and on the Photos page). Which photos it shows is
 * picked on the Photos page.
 */
export default function ScreenSaverSettings({ onPreview, bare }: { onPreview?: () => void; /** In its own pop-up: no heading or divider. */ bare?: boolean }) {
  const saver = screenSaverSettings(useSettings().data?.screensaver);
  const setSetting = useSetSetting();
  const wake = useWakeStatus();
  const save = (patch: Partial<Settings>) => setSetting.mutate({ key: 'screensaver', value: { ...saver, ...patch } });
  return (
    <section className={bare ? s.bare : s.home}>
      {!bare && <h3 className={s.section}>Screen saver</h3>}
      <label className={s.saverRow}>
        <input type="checkbox" checked={saver.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        Show photos when the wall is idle
      </label>
      {saver.enabled && (
        <>
          <div className={s.saverGrid}>
            <label>
              Start after
              <select value={saver.idleMinutes} onChange={(e) => save({ idleMinutes: Number(e.target.value) })}>
                {IDLE.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
              </select>
            </label>
            <label>
              Each photo for
              <select value={saver.seconds} onChange={(e) => save({ seconds: Number(e.target.value) })}>
                {SECONDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>
              Transition
              <select value={saver.transition} onChange={(e) => save({ transition: e.target.value as Settings['transition'] })}>
                {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <label className={s.saverRow}>
            <input type="checkbox" checked={saver.showEvents} onChange={(e) => save({ showEvents: e.target.checked })} />
            Show today's events (bottom left, under the clock)
          </label>
          <label className={s.saverRow}>
            <input type="checkbox" checked={saver.night} onChange={(e) => save({ night: e.target.checked })} />
            Dim the photos at night (and change them more slowly)
          </label>
          {saver.night && (
            <div className={s.saverGrid}>
              <label>
                From
                <input type="time" value={saver.nightFrom} onChange={(e) => e.target.value && save({ nightFrom: e.target.value })} />
              </label>
              <label>
                Until
                <input type="time" value={saver.nightTo} onChange={(e) => e.target.value && save({ nightTo: e.target.value })} />
              </label>
            </div>
          )}
          <p className={s.hint}>Pick which photos it shows on the Photos page.</p>
          <p className={s.hint}>
            {WAKE[wake.status]}
            {wake.status === 'refused' && ` (${wake.reason || 'no reason given'}). Tap anywhere to try again; Low Power Mode also stops it.`}
          </p>
          {onPreview && <button type="button" className={s.saverPreview} onClick={onPreview}>Play it now</button>}
        </>
      )}
    </section>
  );
}
