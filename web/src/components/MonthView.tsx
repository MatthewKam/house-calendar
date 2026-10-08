import type { CSSProperties } from 'react';
import { dayKey, timeLabel } from '../lib/dates';
import { eventPaint, eventsOn, isOver } from '../lib/events';
import { useNow } from '../lib/useNow';
import type { CalEvent, Member } from '../lib/types';
import s from '../styles/MonthView.module.css';

/** Events listed per cell before collapsing the rest into "+N more". */
const MAX_SHOWN = 3;

interface Props {
  /** Whole weeks covering the month, from monthGridDays(). */
  days: Date[];
  /** Month being shown (0-11); days outside it are dimmed. */
  month: number;
  today: string;
  /** Day shown in the day panel, if open. */
  selected: string | null;
  events: CalEvent[];
  members: Member[];
  onSelect: (day: string) => void;
  onOpen: (event: CalEvent, day: string) => void;
}

export default function MonthView({ days, month, today, selected, events, members, onSelect, onOpen }: Props) {
  // Events that have ended fade back (checked every minute).
  const now = useNow();

  return (
    <div className={s.month} style={{ '--rows': days.length / 7 } as CSSProperties}>
      {days.slice(0, 7).map((d) => (
        <div key={d.getDay()} className={s.dow}>{d.toLocaleDateString([], { weekday: 'short' })}</div>
      ))}
      {days.map((day) => {
        const key = dayKey(day);
        const list = eventsOn(events, day);
        const extra = list.length - MAX_SHOWN;
        return (
          // Tapping a day opens it in the day panel.
          <section key={key} role="button" tabIndex={0}
            className={[s.cell, day.getMonth() !== month && s.outside, key === today && s.today, key === selected && s.selected]
              .filter(Boolean).join(' ')}
            onClick={() => onSelect(key)} onKeyDown={(e) => e.key === 'Enter' && onSelect(key)}>
            <span className={s.num}>{day.getDate()}</span>
            <ul className={s.list}>
              {list.slice(0, extra > 0 ? MAX_SHOWN - 1 : MAX_SHOWN).map((ev) => (
                <li key={ev.id}>
                  <button className={`${s.ev} ${ev.allDay ? s.allday : ''} ${isOver(ev, now) ? s.past : ''}`} style={eventPaint(ev, members).vars}
                    onClick={(e) => { e.stopPropagation(); onOpen(ev, key); }}>
                    {!ev.allDay && Date.parse(ev.start) >= day.getTime() && (
                      <span className={s.time}>{timeLabel(ev.start)}</span>
                    )}
                    <span className={s.title}>{ev.title}</span>
                  </button>
                </li>
              ))}
              {extra > 0 && <li className={s.more}>+{extra + 1} more</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
