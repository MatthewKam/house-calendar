import type { PushState, usePush } from '../lib/usePush';
import s from '../styles/MembersPanel.module.css';

/** The word beside Alerts in Settings while it's folded. */
export const ALERTS_NOTE: Record<PushState, string> = {
  loading: '', on: 'On', off: 'Off', 'home-screen': 'Off', blocked: 'Blocked', unsupported: 'Not here',
};

/** Alerts on this device: a switch, or what to do first when it can't be turned on here. */
export default function AlertsSetting({ push }: { push: ReturnType<typeof usePush> }) {
  const { state, busy, error, turnOn, turnOff } = push;
  return (
    <section className={s.bare}>
      {state === 'on' || state === 'off' ? (
        <label className={s.saverRow}>
          <input type="checkbox" checked={state === 'on'} disabled={busy}
            onChange={(e) => void (e.target.checked ? turnOn() : turnOff())} />
          Alerts on this device
        </label>
      ) : null}
      {state !== 'loading' && <p className={s.hint}>{HINTS[state]}</p>}
      {error && <p className={s.error}>{error}</p>}
    </section>
  );
}

const HINTS: Record<Exclude<PushState, 'loading'>, string> = {
  on: 'Reminders on your lists alert you here when they come due (at their time, or 8 AM for a day), and so does time to leave.',
  off: 'Turn on to be alerted here when a reminder on your lists comes due, and when it\'s time to leave.',
  'home-screen': 'On iPhone and iPad, alerts need Sprig on your Home Screen: tap Share, then Add to Home Screen, and open Sprig from there.',
  blocked: 'Alerts are blocked for Sprig in this browser. Allow notifications for this site in the browser\'s settings, then come back.',
  unsupported: 'This browser can\'t show alerts from Sprig. Try Sprig on your phone, added to the Home Screen.',
};
