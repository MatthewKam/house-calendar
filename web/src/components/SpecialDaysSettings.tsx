import { useState, type FormEvent } from 'react';
import { useChangeSpecialDays, useSpecialDays } from '../lib/queries';
import { fromDayKey } from '../lib/dates';
import type { Member } from '../lib/types';
import DateInput from './DateInput';
import IconPicker from './IconPicker';
import sheet from '../styles/Sheet.module.css';
import s from '../styles/MembersPanel.module.css';

/** Pictures to pick from first (Show more, or a search, for the rest). */
const PICTURES = ['🎉', '🎂', '🎭', '🚗', '✈️', '🏖️', '🎪', '🎠', '🧸', '👵', '🏫', '⚽', '🎨', '🎵', '🐶', '🌟'];

/** The word beside Special days in Settings while it's folded: how many are coming up. */
export function specialNote(count: number) {
  return count ? `${count} added` : '';
}

/**
 * Days for the kids to look forward to, on their Today in that month with a countdown in sleeps ("Cousins
 * visit", "School play"): for everyone or one kid, once or every year. Holidays and birthdays are there
 * already.
 */
export default function SpecialDaysSettings({ members, today }: { members: Member[]; today: string }) {
  const days = useSpecialDays().data ?? [];
  const change = useChangeSpecialDays();
  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [picture, setPicture] = useState<string | null>('🎉');
  const [picking, setPicking] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [yearly, setYearly] = useState(false);
  // Ones still to come (and every year's), soonest first.
  const shown = days.filter((d) => d.yearly || d.day >= today);
  const who = (id: string | null) => (id ? members.find((m) => m.id === id)?.name.split(' ')[0] ?? 'Someone' : 'Everyone');

  function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !day) return;
    change.add.mutate({ name: name.trim(), day, picture: picture ?? '🎉', memberId: memberId || null, yearly }, {
      onSuccess: () => {
        setName('');
        setDay('');
        setYearly(false);
      },
    });
  }

  return (
    <section className={s.bare}>
      <p className={s.hint}>
        Days for the kids to look forward to: they show on kid mode's Today in their month, with how many sleeps until
        each. Holidays and family birthdays are there already.
      </p>
      {shown.length > 0 && (
        <ul className={s.specialList}>
          {shown.map((d) => (
            <li key={d.id} className={s.specialRow}>
              <span className={s.specialPicture} aria-hidden="true">{d.picture}</span>
              <span className={s.specialWhat}>
                <b>{d.name}</b>
                <span className={s.hint}>
                  {fromDayKey(d.day).toLocaleDateString([], d.yearly ? { month: 'long', day: 'numeric' } : { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                  {d.yearly && ', every year'} · {who(d.memberId)}
                </span>
              </span>
              <button type="button" className={sheet.secondary} disabled={change.remove.isPending}
                onClick={() => change.remove.mutate(d.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form className={s.specialAdd} onSubmit={add}>
        <div className={s.row}>
          <button type="button" className={s.specialPick} aria-label="Pick a picture" aria-expanded={picking}
            onClick={() => setPicking((p) => !p)}>{picture ?? '🎉'}</button>
          <input className={s.name} placeholder="What's happening" value={name} maxLength={60} aria-label="What's happening"
            onChange={(e) => setName(e.target.value)} />
        </div>
        {picking && (
          <IconPicker value={picture} featured={PICTURES} onChange={(next) => {
            setPicture(next);
            setPicking(false);
          }} />
        )}
        <div className={s.row}>
          <DateInput className={s.specialField} value={day} min={today} aria-label="Day" onChange={(e) => setDay(e.target.value)} />
          <select className={s.specialField} value={memberId} aria-label="For" onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Everyone</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <label className={s.saverRow}>
          <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
          Every year
        </label>
        <div className={s.row}>
          <button type="submit" className={sheet.primary} disabled={!name.trim() || !day || change.add.isPending}>Add</button>
        </div>
      </form>
      {(change.add.isError || change.remove.isError) && <p className={s.error}>{(change.add.error ?? change.remove.error)?.message}</p>}
    </section>
  );
}
