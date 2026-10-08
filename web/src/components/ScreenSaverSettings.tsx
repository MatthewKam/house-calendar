import { useSetSetting, useSettings } from '../lib/queries';
import { screenSaverSettings, TRANSITIONS } from '../lib/screensaver';
import type { ScreenSaverSettings as Settings } from '../lib/types';
import s from '../styles/MembersPanel.module.css';

const IDLE = [5, 10, 15, 30, 60];
const SECONDS: [number, string][] = [[10, '10 seconds'], [20, '20 seconds'], [30, '30 seconds'], [60, '1 minute'],
  [120, '2 minutes'], [300, '5 minutes'], [1200, '20 minutes']];

/**
 * Settings for the photo screen saver (in Settings, and on the Photos page). Which photos it shows is
 * picked on the Photos page.
 */
export default function ScreenSaverSettings({ onPreview, bare }: { onPreview?: () => void; /** In its own pop-up: no heading or divider. */ bare?: boolean }) {
  const saver = screenSaverSettings(useSettings().data?.screensaver);
  const setSetting = useSetSetting();
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
                {IDLE.map((m) => <option key={m} value={m}>{m} minutes</option>)}
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
          {onPreview && <button type="button" className={s.saverPreview} onClick={onPreview}>Play it now</button>}
        </>
      )}
    </section>
  );
}
