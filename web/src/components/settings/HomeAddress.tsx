import { useState, type FormEvent } from 'react';
import { useSetSetting, useSettings } from '../../lib/queries';
import sheet from '../../styles/Sheet.module.css';
import s from '../../styles/Settings.module.css';

/** Where travel times start from. Saved with Save, so a half-typed address isn't used. */
export default function HomeAddress() {
  const saved = (useSettings().data?.homeAddress as string | undefined) ?? '';
  const setSetting = useSetSetting();
  // The address being typed; null shows the saved one behind the pencil. With nothing saved yet,
  // the field is open straight away.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null || !saved;
  const value = draft ?? saved;
  function save(e: FormEvent) {
    e.preventDefault();
    if (value.trim() !== saved) setSetting.mutate({ key: 'homeAddress', value: value.trim() });
    setDraft(null);
  }
  return (
    <section className={s.bare}>
      <p className={s.hint}>Travel times to events start here.</p>
      {editing ? (
        <form className={s.row} onSubmit={save}>
          <input className={s.name} placeholder="e.g. 1 Main St, Irvine, CA" value={value} maxLength={300}
            autoFocus={!!saved} onChange={(e) => setDraft(e.target.value)} aria-label="Home address"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && saved) { e.stopPropagation(); setDraft(null); }
            }} />
          <button type="submit" className={sheet.primary} disabled={!value.trim() || value.trim() === saved}>Save</button>
          {saved && <button type="button" className={sheet.secondary} onClick={() => setDraft(null)}>Cancel</button>}
        </form>
      ) : (
        <div className={s.row}>
          <span className={s.nameText}>{saved}</span>
          <button type="button" className={s.editButton} aria-label="Edit home address" onClick={() => setDraft(saved)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
              <path d="M13.5 8.5l3 3" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
