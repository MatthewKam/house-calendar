import { useMemo, useState } from 'react';
import { addDays, dayKey, fromDayKey } from '../../lib/dates';
import { useMembers, useRangeEvents, useSpecialReminders } from '../../lib/queries';
import { birthdays, sleepsUntil, specialDaysBetween, specialEvent, type SpecialDay } from '../../lib/specialDays';
import { beforeLabel } from '../../../../shared/specialReminders.ts';
import { Loading, Skeleton } from '../ui/Skeleton';
import SpecialDayDialog from './SpecialDayDialog';
import s from './Today.module.css';

/** Special days this far ahead, and at most this many of them. */
const SPECIAL_DAYS_AHEAD = 60;
const SPECIAL_DAYS_SHOWN = 6;

/** "Today", "Tomorrow", or "In 12 days". */
const countdown = (days: number) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`);

/**
 * Special days coming up (the next few, in the next two months): holidays, the family's birthdays, and
 * events marked special, each with how long until it. A grown-up can add one (a new event, marked special),
 * and tap one to set their own reminders on it (shown under it).
 */
export default function SpecialDays({ today, onAdd }: { today: string; onAdd?: () => void }) {
	const people = useMembers().data ?? [];
	const reminders = useSpecialReminders().data ?? [];
	const [open, setOpen] = useState<SpecialDay | null>(null);
	const start = useMemo(() => fromDayKey(today), [today]);
	const to = dayKey(addDays(start, SPECIAL_DAYS_AHEAD));
	const eventsQuery = useRangeEvents(start, SPECIAL_DAYS_AHEAD + 1);
	const events = eventsQuery.data ?? [];
	// Each special one once, on its first day.
	const special: SpecialDay[] = events
		.filter((e) => e.special && !e.busy)
		.map((e) => specialEvent(e.allDay ? e.start : dayKey(new Date(e.start)), e.title))
		.filter((d, i, all) => all.findIndex((x) => x.day === d.day && x.name === d.name) === i);
	const days = specialDaysBetween(today, to, (year) => [
		...birthdays(people, year),
		...special.filter((d) => d.day.startsWith(`${year}-`)),
	]).slice(0, SPECIAL_DAYS_SHOWN);
	return (
		<section className={s.card} aria-label="Special days">
			<div className={s.cardTop}>
				<h2 className={s.cardHead}>Special days</h2>
				{onAdd && (
					<button type="button" className={s.catch} onClick={onAdd}>
						＋ Add a special day
					</button>
				)}
			</div>
			{eventsQuery.isPending ? (
				<Loading label="Loading special days">
					<Skeleton height="3rem" />
					<Skeleton height="3rem" />
					<Skeleton height="3rem" />
				</Loading>
			) : days.length === 0 ? (
				<p className={s.none}>Nothing special in the next two months yet.</p>
			) : (
				<ul className={s.specials}>
					{days.map((d) => {
						const until = sleepsUntil(today, d.day);
						return (
							<li key={`${d.day}-${d.name}`}>
								<button
									type="button"
									className={`${s.specialRow} ${until === 0 ? s.specialToday : ''}`}
									onClick={() => setOpen(d)}
								>
									<span className={s.specialPicture} aria-hidden="true">
										{d.picture}
									</span>
									<span className={s.what}>
										<span className={s.title}>{d.name}</span>
										<span className={s.where}>
											{fromDayKey(d.day).toLocaleDateString([], {
												weekday: 'short',
												month: 'short',
												day: 'numeric',
											})}
										</span>
										{reminders
											.filter((r) => r.key === d.key)
											.map((r) => (
												<span key={r.id} className={s.specialReminder}>
													🔔 {beforeLabel(r.daysBefore)}
													{r.note && ` · ${r.note}`}
												</span>
											))}
									</span>
									<span className={s.countdown}>{countdown(until)}</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
			{open && <SpecialDayDialog day={open} onClose={() => setOpen(null)} />}
		</section>
	);
}
