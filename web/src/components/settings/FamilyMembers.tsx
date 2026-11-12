import { useState, type CSSProperties, type FormEvent } from 'react';
import { PALETTE } from '../../lib/color';
import { dayKey } from '../../lib/dates';
import { useAuthStatus, useSetMemberColor, useUpdateMember } from '../../lib/queries';
import { STAGE_AGES, STAGE_LIST, STAGE_NAMES } from '../../lib/stages';
import type { Member, MemberPatch, Stage } from '../../lib/types';
import ColorAsked from '../account/ColorAsked';
import DateInput from '../ui/DateInput';
import sheet from '../ui/Sheet.module.css';
import s from './Settings.module.css';

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

/**
 * The family (Settings, Family): each person with their color, name and stage; the pencil opens one
 * to change their name, color, birthday and stage, saved together with Save. People's colors are the
 * household's: the account holder's changes are made, anyone else's asked for (ColorAsked shows one
 * waiting). People join with an invite (Settings, Users), not here.
 */
export default function FamilyMembers({ members }: { members: Member[] }) {
  const auth = useAuthStatus().data;
  const updateMember = useUpdateMember();
  const setColor = useSetMemberColor();
  // Signed out there's no holder. A grown-up's color is only theirs to change.
  const holder = !auth?.signedIn || auth.holder;
  const canColor = (m: Member) => !auth?.signedIn || !m.guardian || m.id === auth.memberId;
  // Person being edited (opened with the pencil), one at a time. Name, color, birthday and stage are
  // saved together with Save, and Cancel drops them all.
  const [editing, setEditing] = useState<{ id: string; name: string; color: string; birthdate: string; stage: Stage | null } | null>(null);
  // Whose color set is showing (a member id), or null.
  const [openSet, setOpenSet] = useState<string | null>(null);
  function startEdit(m: Member) {
    setEditing({ id: m.id, name: m.name, color: m.color, birthdate: m.birthdate ?? '', stage: m.stageChosen });
    setOpenSet(null);
  }
  function stopEdit() {
    setEditing(null);
    setOpenSet(null);
  }
  function saveEdit(e: FormEvent, m: Member) {
    e.preventDefault();
    if (!editing) return;
    const name = editing.name.trim();
    const patch: MemberPatch = {};
    if (name && name !== m.name) patch.name = name;
    if ((editing.birthdate || null) !== m.birthdate) patch.birthdate = editing.birthdate || null;
    if (editing.stage !== m.stageChosen) patch.stage = editing.stage;
    if (Object.keys(patch).length) updateMember.mutate({ id: m.id, patch });
    if (editing.color !== m.color) setColor.mutate({ id: m.id, color: editing.color, holder });
    stopEdit();
  }

  return (
    <>
      <p className={s.hint}>
        Tap the pencil to change a name, color or birthday. A birthday sets each kid's stage, which decides how they earn stars.
        {!holder && auth?.signedIn && ` A new color waits for ${auth.holderName ?? 'the account holder'} to OK it.`}
      </p>

      <ul className={s.list}>
        {members.map((m) => {
          const isEditing = editing?.id === m.id;
          const color = isEditing ? editing.color : m.color;
          return (
            <li key={m.id} className={s.member}>
              <div className={s.row}>
                {/* The color can only be changed while editing. */}
                {isEditing && canColor(m) ? (
                  <button type="button" className={`${s.swatch} ${s.swatchEditable}`} style={{ background: color }}
                    aria-label={`Change color for ${m.name}`} aria-expanded={openSet === m.id}
                    onClick={() => setOpenSet((open) => (open === m.id ? null : m.id))} />
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
                    <span className={s.nameText}>
                      {m.name}
                      {m.stage && <span className={s.stageTag}>{STAGE_NAMES[m.stage]}</span>}
                    </span>
                    <button type="button" className={s.editButton} aria-label={`Edit ${m.name}`}
                      onClick={() => startEdit(m)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                        <path d="M13.5 8.5l3 3" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              {isEditing && (
                <div className={s.details}>
                  <label className={s.detail}>
                    <span>Birthday</span>
                    <DateInput className={s.dateInput} aria-label="Birthday" value={editing.birthdate} max={dayKey(new Date())}
                      onChange={(e) => setEditing({ ...editing, birthdate: e.target.value })} />
                  </label>
                  <label className={s.detail}>
                    <span>Stage</span>
                    <select className={s.dateInput} value={editing.stage ?? ''}
                      onChange={(e) => setEditing({ ...editing, stage: (e.target.value || null) as Stage | null })}>
                      <option value="">From birthday</option>
                      {STAGE_LIST.map((st) => (
                        <option key={st} value={st}>{STAGE_NAMES[st]} ({STAGE_AGES[st]})</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {!isEditing && m.colorAsked && <ColorAsked member={m} />}
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
    </>
  );
}
