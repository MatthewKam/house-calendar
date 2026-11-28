import { useState } from 'react';
import { MOST, UNITS, beforeLabel, remindDay, type Before, type Unit } from '../../../../shared/specialReminders.ts';
import { dayKey } from '../../lib/dates';
import { useChangeSpecialReminders, usePlansAccess, useSpecialReminders } from '../../lib/queries';
import type { CalEvent } from '../../lib/types';
import { usePush } from '../../lib/usePush';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import s from './styles/DayPlans.module.css';

interface Props {
	planKey: string;
	/** What it's on ("Mom's birthday", "Saturday, December 12", "Jiu jitsu"). */
	name: string;
	/** The day it's on (YYYY-MM-DD), and an event's start when it has a time (hours before then). */
	day: string;
	start?: string;
	/** Just the once (not every year or every repeat): only times still to come. */
	once: boolean;
	/** How often ("Every year, just for you."). */
	hint: string;
}

/** Whether a reminder that long before would still come (it's not just the once, or the time's ahead). */
function stillAhead(before: Before | null, { day, start, once }: Pick<Props, 'day' | 'start' | 'once'>, now: Date) {
	if (!once) return true;
	if (before?.unit === 'hour') return !!start && Date.parse(start) - before.amount * 3_600_000 > now.getTime();
	return remindDay(day, before) >= dayKey(now);
}

/**
 * Your reminders on a day or an event: on the day, or a number of hours, days, weeks or months before,
 * and what to do then ("Pick up a present"). Just yours, as alerts on your phone (server/specialReminders.ts).
 */
export default function Reminders(props: Props) {
	const { planKey, name, start, hint } = props;
	const mine = (useSpecialReminders().data ?? []).filter((r) => r.key === planKey);
	const { add, remove } = useChangeSpecialReminders();
	const push = usePush();
	// Hours only for an event with a time.
	const units = UNITS.filter((u) => u !== 'hour' || !!start);
	const [onTheDay, setOnTheDay] = useState(false);
	const [amount, setAmount] = useState('1');
	const [unit, setUnit] = useState<Unit>('day');
	const [note, setNote] = useState('');

	const n = Number(amount);
	const valid = onTheDay || (Number.isInteger(n) && n >= 1 && n <= MOST[unit]);
	const before: Before | null = onTheDay || !valid ? null : { amount: n, unit };
	const ahead = valid && stillAhead(before, props, new Date());

	function addIt() {
		if (!valid || !ahead) return;
		add.mutate({ key: planKey, name, before, note: note.trim() || null }, { onSuccess: () => setNote('') });
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
								<span className={s.when}>{beforeLabel(r.before)}</span>
							</span>
							<button
								type="button"
								className={s.remove}
								aria-label={`Take off ${r.note ?? 'the reminder'}, ${beforeLabel(r.before).toLowerCase()}`}
								onClick={() => remove.mutate(r.id)}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}
			<p className={s.none}>{hint}</p>
			<div className={s.whenRow}>
				<Segmented
					className={s.whenBar}
					label="When"
					value={onTheDay ? 'day' : 'before'}
					onChange={(id) => setOnTheDay(id === 'day')}
					options={[
						{ id: 'day', label: 'On the day' },
						{ id: 'before', label: 'Before' },
					]}
				/>
				{!onTheDay && (
					<div className={s.howLong}>
						<input
							className={`${s.input} ${s.amount}`}
							type="number"
							inputMode="numeric"
							min={1}
							max={MOST[unit]}
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							aria-label="How many"
						/>
						<select
							className={s.input}
							value={unit}
							onChange={(e) => setUnit(e.target.value as Unit)}
							aria-label="Hours, days, weeks or months"
						>
							{units.map((u) => (
								<option key={u} value={u}>
									{n === 1 ? u : `${u}s`}
								</option>
							))}
						</select>
						<span className={s.when}>before</span>
					</div>
				)}
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
				<Button variant="primary" className={s.add} onClick={addIt} disabled={!valid || !ahead || add.isPending}>
					Add
				</Button>
			</div>
			{!valid && (
				<p className={s.problem}>
					From 1 to {MOST[unit]} {unit}s before.
				</p>
			)}
			{valid && !ahead && <p className={s.problem}>That time has already gone by.</p>}
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
			day={event.allDay ? event.start : dayKey(new Date(event.start))}
			start={event.allDay ? undefined : event.start}
			once={!event.repeats}
			hint={event.repeats ? 'Every time it repeats, just for you.' : 'Just for you.'}
		/>
	);
}
