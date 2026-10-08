import { useEffect } from 'react';
import { fromDayKey } from '../lib/dates';
import { eventsOn } from '../lib/events';
import { useRangeEvents } from '../lib/queries';
import type { CalEvent, Member } from '../lib/types';
import DayTimeline from './DayTimeline';
import s from '../styles/DayPanel.module.css';

interface Props {
  day: string;
  /** The header's person filter. */
  shown: (ev: CalEvent) => boolean;
  today: string;
  members: Member[];
  onAdd: (day: string) => void;
  onOpen: (event: CalEvent, day: string) => void;
  onClose: () => void;
}

/** The selected day's events, floating over the right side of the month or week grid. */
export default function DayPanel({ day, shown, today, members, onAdd, onOpen, onClose }: Props) {
  const date = fromDayKey(day);
  // Its own one-day query, so the panel stays correct when the grid pages to another month or week.
  const events = eventsOn(useRangeEvents(date, 1).data ?? [], date).filter(shown);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
    {/* Tapping anywhere outside the panel closes it. */}
    <div className={s.scrim} onClick={onClose} role="presentation" />
    <aside className={s.panel} aria-label="Day">
      <header className={s.head}>
        <div>
          <div className={s.dow}>
            {date.toLocaleDateString([], { weekday: 'long' })}
            {day === today && <span className={s.badge}>Today</span>}
          </div>
          <h2 className={s.date}>{date.toLocaleDateString([], { month: 'long', day: 'numeric' })}</h2>
        </div>
        <button className={s.close} onClick={onClose} aria-label="Close day panel">×</button>
      </header>

      {events.length === 0 && <p className={s.empty}>Nothing planned.</p>}
      {/* All 24 hours, scrolled to the time now (or the first event). */}
      <DayTimeline day={date} today={today} events={events} members={members} onOpen={(ev) => onOpen(ev, day)} />

      <button className={s.add} onClick={() => onAdd(day)}>+ Add event</button>
    </aside>
    </>
  );
}
