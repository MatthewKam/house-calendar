import { useEffect, type CSSProperties } from 'react';
import { addDays, fromDayKey, timeLabel } from '../lib/dates';
import { eventPaint, eventsOn } from '../lib/events';
import { useRangeEvents } from '../lib/queries';
import type { CalEvent, Member } from '../lib/types';
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

/** "9:00 AM – 10:00 AM", or "until …" / "from …" when the event runs past this day. */
function timeRange(ev: CalEvent, day: Date) {
  const startsBefore = Date.parse(ev.start) < day.getTime();
  const endsAfter = Date.parse(ev.end) > addDays(day, 1).getTime();
  if (startsBefore && endsAfter) return 'All day';
  if (startsBefore) return `until ${timeLabel(ev.end)}`;
  if (endsAfter) return `from ${timeLabel(ev.start)}`;
  return `${timeLabel(ev.start)} – ${timeLabel(ev.end)}`;
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
      <ul className={s.list}>
        {events.map((ev) => {
          const paint = eventPaint(ev, members);
          return (
            <li key={ev.id}>
              <button className={`${s.ev} ${ev.allDay ? s.allday : ''}`}
                style={{ ...paint.vars, color: ev.allDay ? paint.text : undefined } as CSSProperties}
                onClick={() => onOpen(ev, day)}>
                <span className={s.time}>{ev.allDay ? 'All day' : timeRange(ev, date)}</span>
                <span className={s.title}>{ev.title}</span>
                {paint.people.length > 0 && (
                  <span className={s.who}>{new Intl.ListFormat([], { type: 'conjunction' }).format(paint.people.map((m) => m.name))}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <button className={s.add} onClick={() => onAdd(day)}>+ Add event</button>
    </aside>
    </>
  );
}
