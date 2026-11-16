import { useState } from 'react';
import { addDayKey } from '../../../../shared/days.ts';
import { DAYS_BEFORE, HOURS_BEFORE, beforeLabel, type SpecialReminder } from '../../../../shared/specialReminders.ts';
import { dayKey } from '../../lib/dates';
import { useChangeSpecialReminders, usePlansAccess, useSpecialReminders } from '../../lib/queries';
import type { CalEvent } from '../../lib/types';
import { usePush } from '../../lib/usePush';
import s from './DayPlans.module.css';

/** A time to be reminded: days before (at 8 in the morning), or hours before an event starts. */
export type Choice = Pick<SpecialReminder, 'daysBefore' | 'hoursBefore'>;

/** The choices for a day (only the ones still to come when it's just the once). */
export const dayChoices = (day: string, today: string, once: boolean): Choice[] =>
	DAYS_BEFORE.filter((n) => !once || addDayKey(day, -n) >= today).map((n) => ({ daysBefore: n, hoursBefore: null }));

/** The choices for an event: hours before too when it has a time; a one-off's only while still to come. */
export function eventChoices(event: CalEvent, now: Date): Choice[] {
	const day = event.allDay ? event.start : dayKey(new Date(event.start));
	const hours = event.allDay
		? []
		: HOURS_BEFORE.filter((h) => event.repeats || Date.parse(event.start) - h * 3_600_000 > now.getTime()).map((h) => ({
				daysBefore: 0 as const,
				hoursBefore: h,
			}));
	return [...hours, ...dayChoices(day, dayKey(now), !event.repeats)];
}

const label = (c: Choice) => beforeLabel(c.daysBefore, c.hoursBefore);
const same = (a?: Choice, b?: Choice) => a?.daysBefore === b?.daysBefore && a?.hoursBefore === b?.hoursBefore;

/**
 * Your reminders on a day or an event: when, and what to do then ("Pick up a present"). Just yours,
 * as alerts on your phone (server/specialReminders.ts).
 */
export default function Reminders({
	planKey,
	name,
	choices,
	hint,
}: {
	planKey: string;
	/** What it's on ("Mom's birthday", "Saturday, December 12", "Jiu jitsu"). */
	name: string;
	choices: Choice[];
	/** How often ("Every year, just for you."). */
	hint: string;
}) {
	const mine = (useSpecialReminders().data ?? []).filter((r) => r.key === planKey);
	const { add, remove } = useChangeSpecialReminders();
	const push = usePush();
	const [pick, setPick] = useState<Choice | undefined>(
		choices.find((c) => c.daysBefore === 1 && !c.hoursBefore) ?? choices[choices.length - 1],
	);
	const [note, setNote] = useState('');

	function addIt() {
		if (!pick) return;
		add.mutate({ key: planKey, name, ...pick, note: note.trim() || null }, { onSuccess: () => setNote('') });
	}

	return (
		<section className={s.section} aria-label="Your reminders">
			<h3 className={s.subhead}>🔔 Your reminders</h3>
			{mine.length > 0 && (
				<ul className={s.reminders}>
					{mine.map((r) => (
						<li key={r.id}>
							<span className={s.what}>
								<span className={s.title}>{r.note ?? 'Reminder'}</span>
								<span className={s.when}>{label(r)}</span>
							</span>
							<button
								type="button"
								className={s.remove}
								aria-label={`Take off ${r.note ?? 'the reminder'}, ${label(r).toLowerCase()}`}
								onClick={() => remove.mutate(r.id)}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}
			{choices.length === 0 ? (
				<p className={s.none}>This has gone by.</p>
			) : (
				<>
					<p className={s.none}>{hint}</p>
					<div className={s.times} role="group" aria-label="When">
						{choices.map((c) => (
							<button key={label(c)} type="button" aria-pressed={same(pick, c)} onClick={() => setPick(c)}>
								{label(c)}
							</button>
						))}
					</div>
					<div className={s.addRow}>
						<input
							className={s.input}
							value={note}
							onChange={(e) => setNote(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addIt();
								}
							}}
							maxLength={200}
							placeholder="What to do then? (Pick up a present)"
							aria-label="What to do then"
						/>
						<button type="button" className={s.add} onClick={addIt} disabled={add.isPending}>
							Add
						</button>
					</div>
				</>
			)}
			{(add.isError || remove.isError) && <p className={s.problem}>{(add.error ?? remove.error)?.message}</p>}
			{push.state !== 'on' && push.state !== 'loading' && (
				<p className={s.none}>Reminders come as alerts: turn them on in Settings → Notifications on your phone.</p>
			)}
		</section>
	);
}

/** Your reminders on an event (every time it repeats), for a guardian on their own device. */
export function EventReminders({ event }: { event: CalEvent }) {
	const access = usePlansAccess();
	if (!access.reminders || event.busy) return null;
	return (
		<Reminders
			planKey={event.planKey}
			name={event.title}
			choices={eventChoices(event, new Date())}
			hint={event.repeats ? 'Every time it repeats, just for you.' : 'Just for you.'}
		/>
	);
}
