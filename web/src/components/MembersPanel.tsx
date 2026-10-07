import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { PALETTE } from '../lib/color';
import { useAddMember, useRemoveMember, useSetSetting, useSettings, useUpdateMember } from '../lib/queries';
import type { Member } from '../lib/types';
import CalendarList from './CalendarList';
import ScreenSaverSettings from './ScreenSaverSettings';
import sheet from '../styles/Sheet.module.css';
import s from '../styles/MembersPanel.module.css';

interface Props { members: Member[]; uiScale: number; onClose: () => void }

/** Adding and removing family members is hidden for now; set to true to bring both back. */
const CAN_ADD_OR_REMOVE = false;

/**
 * Palette shown under a row when its color circle is tapped. Palette taps are final (`done` true);
 * the rainbow dot opens the system picker, which reports every drag step (`done` false).
 */
function ColorSet({ value, label, onPick }: { value: string; label: string; onPick: (color: string, done: boolean) => void }) {
  const isCustom = !PALETTE.includes(value);
  return (
    <div className={s.palette} role="radiogroup" aria-label={label}>
      {PALETTE.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c}
          className={`${s.dot} ${value === c ? s.picked : ''}`} style={{ '--c': c } as CSSProperties}
          onClick={() => onPick(c, true)} />
      ))}
      <label className={`${s.dot} ${s.custom} ${isCustom ? s.picked : ''}`}
        style={{ '--c': isCustom ? value : undefined } as CSSProperties} title="Other color">
        <input type="color" value={value} aria-label="Other color" onChange={(e) => onPick(e.target.value, false)} />
      </label>
    </div>
  );
}

/** Where travel times start from. Saved with Save, so a half-typed address isn't used. */
function HomeAddress() {
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
    <section className={s.home}>
      <h3 className={s.section}>Home address</h3>
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

export default function MembersPanel({ members, uiScale, onClose }: Props) {
  const [newName, setNewName] = useState('');
  // null until someone picks a color; then the next unused palette color is offered.
  const [pickedColor, setPickedColor] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Person being edited (opened with the pencil), one at a time. Name and color are saved together
  // with Save, and Cancel drops both.
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null);
  function startEdit(m: Member) {
    setEditing({ id: m.id, name: m.name, color: m.color });
    setOpenSet(null);
  }
  function stopEdit() {
    setEditing(null);
    setOpenSet(null);
  }
  function saveEdit(e: FormEvent, m: Member) {
    e.preventDefault();
    const name = editing?.name.trim();
    const patch: { name?: string; color?: string } = {};
    if (name && name !== m.name) patch.name = name;
    if (editing && editing.color !== m.color) patch.color = editing.color;
    if (patch.name || patch.color) updateMember.mutate({ id: m.id, patch });
    stopEdit();
  }
  // Whose color set is showing: a member id, 'new' for the add row, or null.
  const [openSet, setOpenSet] = useState<string | null>(null);
  const toggleSet = (key: string) => setOpenSet((open) => (open === key ? null : key));
  const addMember = useAddMember();
  const updateMember = useUpdateMember();
  const removeMember = useRemoveMember();
  const setSetting = useSetSetting();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nextColor = PALETTE.find((c) => !members.some((m) => m.color === c)) ?? PALETTE[0];
  const newColor = pickedColor ?? nextColor;

  function add(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    addMember.mutate({ name: newName.trim(), color: newColor }, {
      onSuccess: () => {
        setNewName('');
        setPickedColor(null);
        setOpenSet(null);
      },
    });
  }

  function remove(m: Member) {
    if (confirmId !== m.id) return setConfirmId(m.id);
    setConfirmId(null);
    removeMember.mutate(m.id);
  }

  return (
    <>
      <div className={sheet.scrim} onClick={onClose} role="presentation" />
      <div className={sheet.sheet} role="dialog" aria-label="Settings">
        <header className={sheet.head}>
          <h2 className={sheet.heading}>Settings</h2>
          <button className={sheet.close} onClick={onClose} aria-label="Close Settings">×</button>
        </header>
        <h3 className={s.section}>Family</h3>
        <p className={s.hint}>Tap the pencil to change a name or color. Colors only change this display.</p>

        <ul className={s.list}>
          {members.map((m) => {
            const isEditing = editing?.id === m.id;
            const color = isEditing ? editing.color : m.color;
            return (
              <li key={m.id} className={s.member}>
                <div className={s.row}>
                  {/* The color can only be changed while editing. */}
                  {isEditing ? (
                    <button type="button" className={`${s.swatch} ${s.swatchEditable}`} style={{ background: color }}
                      aria-label={`Change color for ${m.name}`} aria-expanded={openSet === m.id}
                      onClick={() => toggleSet(m.id)} />
                  ) : (
                    <span className={s.swatch} style={{ background: color }} aria-hidden="true" />
                  )}
                  {isEditing ? (
                    <form className={s.editName} onSubmit={(e) => saveEdit(e, m)}>
                      <input className={s.name} value={editing.name} maxLength={40} autoFocus aria-label={`Name for ${m.name}`}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={(e) => {
                          // Escape cancels the edit without closing Settings.
                          if (e.key === 'Escape') { e.stopPropagation(); stopEdit(); }
                        }} />
                      <button type="submit" className={sheet.primary} disabled={!editing.name.trim()}>Save</button>
                      <button type="button" className={sheet.secondary} onClick={stopEdit}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <span className={s.nameText}>{m.name}</span>
                      <button type="button" className={s.editButton} aria-label={`Edit ${m.name}`}
                        onClick={() => startEdit(m)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                          <path d="M13.5 8.5l3 3" />
                        </svg>
                      </button>
                    </>
                  )}
                  {CAN_ADD_OR_REMOVE && (
                    <button className={sheet.danger} onClick={() => remove(m)}>
                      {confirmId === m.id ? 'Tap again' : 'Remove'}
                    </button>
                  )}
                </div>
                {isEditing && openSet === m.id && (
                  <ColorSet value={color} label={`Color for ${m.name}`} onPick={(c, done) => {
                    setEditing({ ...editing, color: c });
                    if (done) setOpenSet(null);
                  }} />
                )}
              </li>
            );
          })}
        </ul>

        {CAN_ADD_OR_REMOVE && (
        <form onSubmit={add} className={s.add}>
          <div className={s.row}>
            <button type="button" className={s.swatch} style={{ background: newColor }}
              aria-label="Choose color for new person" aria-expanded={openSet === 'new'}
              onClick={() => toggleSet('new')} />
            <input className={s.name} placeholder="Add a person" value={newName} maxLength={40}
              onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className={sheet.primary} disabled={!newName.trim()}>Add</button>
          </div>
          {openSet === 'new' && (
            <ColorSet value={newColor} label="Color for new person" onPick={(c, done) => {
              setPickedColor(c);
              if (done) setOpenSet(null);
            }} />
          )}
        </form>
        )}

        <CalendarList members={members} />

        <HomeAddress />

        <ScreenSaverSettings />

        <label className={s.scale}>
          Text size
          <input type="range" min={0.8} max={1.6} step={0.05} defaultValue={uiScale}
            onChange={(e) => setSetting.mutate({ key: 'uiScale', value: Number(e.target.value) })} />
          <span>{Math.round(uiScale * 100)}%</span>
        </label>

        <div className={sheet.actions}>
          <span className={sheet.spacer} />
          <button className={sheet.secondary} onClick={onClose}>Done</button>
        </div>
      </div>
    </>
  );
}
