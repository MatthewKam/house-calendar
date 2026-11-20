import { useMemo, useState } from 'react';
import { addDays, dayKey, fromDayKey } from '../../lib/dates';
import { dateKey } from '../../../../shared/dayPlans.ts';
import { beforeLabel } from '../../../../shared/specialReminders.ts';
import { useDayPlans, useMembers, usePlansAccess, useRangeEvents, useSpecialReminders } from '../../lib/queries';
import { sleepsUntil, specialDaysIn, type SpecialDay } from '../../lib/specialDays';
import { listOn } from '../calendar/DayPlans';
import { Loading, Skeleton } from '../ui/Skeleton';
import DayDrawer from './DayDrawer';
import s from './Today.module.css';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

/** Special days this far ahead, and at most this many of them. */
const SPECIAL_DAYS_AHEAD = 60;
const SPECIAL_DAYS_SHOWN = 6;

/** "Today", "Tomorrow", or "In 12 days". */
const countdown = (days: number) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`);

/**
 * Special days coming up (the next few, in the next two months): holidays, the family's birthdays, and
 * events marked special, each with how long until it. A grown-up can add one (a new event, marked special),
 * and tap one for its plans (a note, a list, their own reminders), shown in brief under it.
 */
export default function SpecialDays({ today, onAdd }: { today: string; onAdd?: () => void }) {
	const people = useMembers().data ?? [];
	const access = usePlansAccess();
	const reminders = useSpecialReminders(access.reminders).data ?? [];
	const plans = useDayPlans(access.plans).data;
	const [open, setOpen] = useState<SpecialDay | null>(null);
	const start = useMemo(() => fromDayKey(today), [today]);
	const to = dayKey(addDays(start, SPECIAL_DAYS_AHEAD));
	const eventsQuery = useRangeEvents(start, SPECIAL_DAYS_AHEAD + 1);
	const days = specialDaysIn(today, to, people, eventsQuery.data ?? []).slice(0, SPECIAL_DAYS_SHOWN);
	const tappable = access.plans || access.reminders;
	return (
		<Card
			title="Special days"
			action={
				onAdd && (
					<Button size="sm" icon="＋" onClick={onAdd}>
						Add a special day
					</Button>
				)
			}
		>
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
									disabled={!tappable}
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
												<span key={r.id} className={s.specialPlanned}>
													🔔 {beforeLabel(r.before)}
													{r.note && ` · ${r.note}`}
												</span>
											))}
										<Planned plans={plans} keys={[d.key, dateKey(d.day)]} day={d.day} />
									</span>
									<span className={s.countdown}>{countdown(until)}</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
			{open && <DayDrawer day={open} specials={days.filter((d) => d.day === open.day)} onClose={() => setOpen(null)} />}
		</Card>
	);
}

/** A note and how much of the list is done, for its keys (the special day's, and its date's). */
function Planned({ plans, keys, day }: { plans: ReturnType<typeof useDayPlans>['data']; keys: string[]; day: string }) {
	const note = keys.some((k) => plans?.notes[k]);
	const list = keys.flatMap((k) => listOn(plans, k, day));
	if (!note && !list.length) return null;
	return (
		<span className={s.specialPlanned}>
			{[note && '📝 Note', list.length && `☑️ ${list.filter((x) => x.done).length} of ${list.length}`]
				.filter(Boolean)
				.join(' · ')}
		</span>
	);
}
