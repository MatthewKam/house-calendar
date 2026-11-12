import { createContext, useContext, useState, type ReactNode } from 'react';
import Switch from '../ui/Switch';
import s from './Settings.module.css';

// The pieces Settings is built from: its groups (each a view of its own), the parts folded inside them,
// the parts that are on or off, and the ⓘ beside a title.

/** ⓘ beside a title: shows what it is (and hides it again). */
export function InfoButton({ about, open, onToggle }: { about: string; open: boolean; onToggle: () => void }) {
  return <button type="button" className={s.info} aria-label={`About ${about}`} aria-expanded={open} onClick={onToggle}>i</button>;
}

/** Which group of Settings is showing (its title), or null for the list of them. */
export const SettingsView = createContext<{ view: string | null; open: (title: string) => void }>({ view: null, open: () => {} });

/**
 * A group of Settings (Family, Learning, Appearance, Screen, Notifications, Users): in the list, a row (with a word on
 * how it's set, for one that's a single thing); tapped, the sheet shows just it (a back arrow to the list).
 */
export function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const { view, open } = useContext(SettingsView);
  if (view === null) {
    return (
      <button type="button" className={s.groupRow} onClick={() => open(title)}>
        <span>{title}</span>
        {note && <span className={s.foldNote}>{note}</span>}
      </button>
    );
  }
  return view === title ? <>{children}</> : null;
}

/**
 * One part of a group, folded to its heading (and a word on how it's set) until tapped. Opening one
 * closes the others, so the view stays short.
 */
export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <details className={s.fold} {...{ name: 'settings' }}>
      <summary className={s.foldHead}>
        <span>{title}</span>
        {note && <span className={s.foldNote}>{note}</span>}
      </summary>
      <div className={s.foldBody}>{children}</div>
    </details>
  );
}

/**
 * One part of a group that's on or off: its title (with an ⓘ that shows what it does) and a switch,
 * and (on) its settings under it.
 */
export function SwitchRow({ title, on, onChange, hint, children }: { title: string; on: boolean; onChange: (on: boolean) => void; hint: string; children?: ReactNode }) {
  const [info, setInfo] = useState(false);
  return (
    <div className={s.fold}>
      <div className={s.switchHead}>
        <span className={s.switchTitle}>
          {title}
          <InfoButton about={title} open={info} onToggle={() => setInfo(!info)} />
        </span>
        <Switch on={on} onChange={onChange} label={title} />
      </div>
      {info && <p className={s.switchHint}>{hint}</p>}
      {on && children && <div className={s.foldBody}>{children}</div>}
    </div>
  );
}
