import { useEffect, useState } from 'react';
import { dateKey } from '../../../../shared/dayPlans.ts';
import { fromDayKey } from '../../lib/dates';
import { eventsOn } from '../../lib/events';
import { useDayPlans, usePlansAccess, useRangeEvents, useSpecialReminders } from '../../lib/queries';
import { specialDaysIn } from '../../lib/specialDays';
import type { CalEvent, Member } from '../../lib/types';
import DayMeals from './DayMeals';
import DayPlans from './DayPlans';
import DayTimeline from './DayTimeline';
import s from './styles/DayPanel.module.css';

interface Props {
	day: string;
	/** The header's person filter. */
	shown: (ev: CalEvent) => boolean;
	today: string;
	members: Member[];
	/** Adding an event (missing while the parent lock is on). */
	onAdd?: (day: string) => void;
	onOpen: (event: CalEvent, day: string) => void;
	onClose: () => void;
}

/**
 * The selected day, floating over the right side of the month or week grid: its events, and for a
 * grown-up its plans (a note, a list, their own reminders; on a special day, every year or just this day).
 */
export default function DayPanel({ day, shown, today, members, onAdd, onOpen, onClose }: Props) {
	const date = fromDayKey(day);
	// Its own one-day query, so the panel stays correct when the grid pages to another month or week.
	const all = eventsOn(useRangeEvents(date, 1).data ?? [], date);
	const events = all.filter(shown);
	const specials = specialDaysIn(day, day, members, all);
	const access = usePlansAccess();
	const [tab, setTab] = useState<'events' | 'plans'>('events');
	const planned = usePlanned([...specials.map((d) => d.key), dateKey(day)], access);

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
					<button className={s.close} onClick={onClose} aria-label="Close day panel">
						×
					</button>
				</header>

				{(access.plans || access.reminders) && (
					<div className={s.tabs} role="tablist" aria-label="Show">
						<button role="tab" aria-selected={tab === 'events'} onClick={() => setTab('events')}>
							Events
						</button>
						<button role="tab" aria-selected={tab === 'plans'} onClick={() => setTab('plans')}>
							Plans{planned && <span className={s.dot} aria-label=" (something planned)" />}
						</button>
					</div>
				)}

				{tab === 'plans' && (access.plans || access.reminders) ? (
					<div className={s.plans}>
						{/* Keyed by day, so it starts again on the special day when another day is picked. */}
						<DayPlans key={day} day={day} specials={specials} />
					</div>
				) : (
					<>
						<DayMeals day={day} />
						{events.length === 0 && <p className={s.empty}>Nothing planned.</p>}
						{/* All 24 hours, scrolled to the time now (or the first event). */}
						<DayTimeline day={date} today={today} events={events} members={members} onOpen={(ev) => onOpen(ev, day)} />

						{onAdd && (
							<button className={s.add} onClick={() => onAdd(day)}>
								+ Add event
							</button>
						)}
					</>
				)}
			</aside>
		</>
	);
}

/** Whether there's a note, a list or one of your reminders on any of the day's keys. */
function usePlanned(keys: string[], access: ReturnType<typeof usePlansAccess>) {
	const plans = useDayPlans(access.plans).data;
	const reminders = useSpecialReminders(access.reminders).data ?? [];
	return keys.some((k) => plans?.notes[k] || plans?.lists[k]?.length || reminders.some((r) => r.key === k));
}
