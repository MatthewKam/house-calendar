import { useState } from 'react';
import { addDayKey } from '../../../../shared/days.ts';
import { dateKey, dateOfKey, type DayPlans as Plans } from '../../../../shared/dayPlans.ts';
import { DAYS_BEFORE, beforeLabel } from '../../../../shared/specialReminders.ts';
import { fromDayKey } from '../../lib/dates';
import {
	useChangeDayPlans,
	useChangeSpecialReminders,
	useDayPlans,
	usePlansAccess,
	useSpecialReminders,
} from '../../lib/queries';
import type { SpecialDay } from '../../lib/specialDays';
import type { ChecklistItem } from '../../lib/types';
import { usePush } from '../../lib/usePush';
import Checklist from '../ui/Checklist';
import s from './DayPlans.module.css';

/** Pictures to start a day's list from: a party, a trip, a holiday. */
const PLAN_ICONS = ['🎂', '🎈', '🕯️', '🎁', '💐', '🎉', '🍰', '🥤', '🍕', '🧁', '🎀', '💌', '🧺', '🧳', '🎟️', '📸'];

/** "2 of 4 done", or "All done". */
const doneCount = (list: ChecklistItem[]) => {
	const done = list.filter((x) => x.done).length;
	return done === list.length ? 'All done' : `${done} of ${list.length} done`;
};

/** A day's list as checklist items, ticked on `day`. */
export const listOn = (plans: Plans | undefined, key: string, day: string): ChecklistItem[] =>
	(plans?.lists[key] ?? []).map(({ ticked, ...x }) => ({ ...x, done: ticked.includes(day) }));

/**
 * A day's plans: a note and a list the grown-ups share, and your own reminders. On a special day
 * they're for it every year (Mom's birthday), or just this day; `start` picks which shows first.
 */
export default function DayPlans({
	day,
	today,
	specials,
	start,
}: {
	/** YYYY-MM-DD. */
	day: string;
	today: string;
	/** The special days on it. */
	specials: SpecialDay[];
	/** The key to show first (a special day's); else the first special day's, or just this day. */
	start?: string;
}) {
	const access = usePlansAccess();
	const plans = useDayPlans(access.plans).data;
	const [key, setKey] = useState(start ?? specials[0]?.key ?? dateKey(day));
	const special = specials.find((d) => d.key === key);
	const date = fromDayKey(day).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

	return (
		<div className={s.plans}>
			{specials.length > 0 && (
				<div className={s.which} role="group" aria-label="Plans for">
					{specials.map((d) => (
						<button key={d.key} type="button" aria-pressed={key === d.key} onClick={() => setKey(d.key)}>
							{d.picture} {d.name}
							<span className={s.whichHint}>Every year</span>
						</button>
					))}
					<button type="button" aria-pressed={key === dateKey(day)} onClick={() => setKey(dateKey(day))}>
						📅 This day
						<span className={s.whichHint}>Just this once</span>
					</button>
				</div>
			)}
			{/* Keyed, so a half-typed note doesn't carry over to the other one. */}
			{access.plans && <DayNote key={key} planKey={key} saved={plans?.notes[key] ?? ''} />}
			{access.plans && <DayList key={`list-${key}`} planKey={key} day={day} plans={plans} yearly={!!special} />}
			{access.reminders && (
				<DayReminders key={`reminders-${key}`} planKey={key} name={special?.name ?? date} day={day} today={today} />
			)}
		</div>
	);
}

/** The note: saved when you leave the box (or tap Save). */
function DayNote({ planKey, saved }: { planKey: string; saved: string }) {
	const { note } = useChangeDayPlans();
	const [text, setText] = useState(saved);
	const changed = text.trim() !== saved;
	const save = () => changed && note.mutate({ key: planKey, note: text });
	return (
		<section className={s.section} aria-label="Note">
			<h3 className={s.subhead}>📝 Note</h3>
			<textarea
				className={s.note}
				value={text}
				rows={3}
				maxLength={2000}
				placeholder={dateOfKey(planKey) ? 'Anything to remember for this day?' : 'Anything to remember? (Likes tulips)'}
				aria-label="Note"
				onChange={(e) => setText(e.target.value)}
				onBlur={save}
			/>
			{changed && (
				<button type="button" className={s.saveNote} onClick={save} disabled={note.isPending}>
					Save note
				</button>
			)}
			{note.isError && <p className={s.problem}>{note.error.message}</p>}
		</section>
	);
}

function DayList({ planKey, day, plans, yearly }: { planKey: string; day: string; plans?: Plans; yearly: boolean }) {
	const { list, tick } = useChangeDayPlans();
	return (
		<Checklist
			label="☑️ List"
			name="List"
			items={listOn(plans, planKey, day)}
			count={doneCount}
			editHint={yearly ? 'Every year' : 'Just this day'}
			footnote={yearly ? 'Ticks start fresh each year.' : undefined}
			busy={list.isPending}
			placeholder="Add a thing, e.g. cake or balloons"
			itemLabel="Thing on the list"
			icons={PLAN_ICONS}
			onTick={(x, done) => tick.mutate({ key: planKey, itemId: x.id, day, done })}
			onSave={(items) => list.mutate({ key: planKey, items })}
		/>
	);
}

/**
 * Your reminders: when (on the day, or days or weeks before) and what to do then ("Pick up a
 * present"). They come as alerts on your phone; a special day's every year.
 */
function DayReminders({ planKey, name, day, today }: { planKey: string; name: string; day: string; today: string }) {
	const mine = (useSpecialReminders().data ?? []).filter((r) => r.key === planKey);
	const { add, remove } = useChangeSpecialReminders();
	const push = usePush();
	// Just this day: only the times still to come.
	const once = !!dateOfKey(planKey);
	const open = DAYS_BEFORE.filter((n) => !once || addDayKey(day, -n) >= today);
	const [before, setBefore] = useState<(typeof DAYS_BEFORE)[number] | undefined>(
		open.includes(7) ? 7 : open[open.length - 1],
	);
	const [note, setNote] = useState('');

	function addIt() {
		if (before === undefined) return;
		add.mutate({ key: planKey, name, daysBefore: before, note: note.trim() || null }, { onSuccess: () => setNote('') });
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
								<span className={s.when}>{beforeLabel(r.daysBefore)}</span>
							</span>
							<button
								type="button"
								className={s.remove}
								aria-label={`Take off ${r.note ?? 'the reminder'}, ${beforeLabel(r.daysBefore).toLowerCase()}`}
								onClick={() => remove.mutate(r.id)}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}
			{open.length === 0 ? (
				<p className={s.none}>This day has gone by.</p>
			) : (
				<>
					<p className={s.none}>{once ? 'Just for this day.' : 'Every year, just for you.'}</p>
					<div className={s.times} role="group" aria-label="When">
						{open.map((n) => (
							<button key={n} type="button" aria-pressed={before === n} onClick={() => setBefore(n)}>
								{beforeLabel(n)}
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
