import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { dayKey, timeLabel } from '../lib/dates';
import { eventPaint, eventsOn } from '../lib/events';
import type { CalEvent, Member } from '../lib/types';
import s from '../styles/WeekView.module.css';

interface Props {
  days: Date[];
  today: string;
  /** Day shown in the day panel, if open. */
  selected: string | null;
  events: CalEvent[];
  members: Member[];
  onSelect: (day: string) => void;
  onOpen: (event: CalEvent, day: string) => void;
  /** Shown after the last day, scrolling with them (the weather, on narrow screens). */
  footer?: ReactNode;
}

export default function WeekView({ days, today, selected, events, members, onSelect, onOpen, footer }: Props) {
  // When the days are a scrolling list (phones), open on today, or the top if today isn't shown.
  const list = useRef<HTMLDivElement>(null);
  const first = dayKey(days[0]);
  useEffect(() => {
    // Wait a frame: the text-size setting is applied after this renders and shifts the layout.
    const frame = requestAnimationFrame(() => {
      const el = list.current;
      if (!el || el.scrollHeight <= el.clientHeight) return;
      const card = el.querySelector<HTMLElement>(`[data-day="${today}"]`);
      el.scrollTop = card ? card.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop : 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [first, days.length, today]);

  return (
    <div className={s.week} ref={list}>
      {days.map((day) => {
        const key = dayKey(day);
        return (
          // Tapping a day opens it in the day panel.
          <section key={key} data-day={key} className={`${s.day} ${key === today ? s.today : ''} ${key === selected ? s.selected : ''}`}
            onClick={() => onSelect(key)} role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(key)}>
            <div className={s.date}>
              <span className={s.dow}>{day.toLocaleDateString([], { weekday: 'short' })}</span>
              <span className={s.num}>{day.getDate()}</span>
            </div>
            <ul className={s.list}>
              {eventsOn(events, day).map((ev) => {
                const paint = eventPaint(ev, members);
                return (
                  <li key={ev.id}>
                    <button className={`${s.ev} ${ev.allDay ? s.allday : ''}`}
                      style={{ ...paint.vars, color: ev.allDay ? paint.text : undefined } as CSSProperties}
                      onClick={(e) => { e.stopPropagation(); onOpen(ev, key); }}>
                      {!ev.allDay && (
                        <span className={s.time}>
                          {Date.parse(ev.start) < day.getTime() ? `until ${timeLabel(ev.end)}` : timeLabel(ev.start)}
                        </span>
                      )}
                      <span className={s.title}>{ev.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {footer && <div className={s.footer}>{footer}</div>}
    </div>
  );
}
