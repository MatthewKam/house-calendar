import { useState } from 'react';
import { fromDayKey } from '../../lib/dates';
import { useChangeSpecialReminders, useSpecialReminders } from '../../lib/queries';
import type { SpecialDay } from '../../lib/specialDays';
import { usePush } from '../../lib/usePush';
import { DAYS_BEFORE, beforeLabel } from '../../../../shared/specialReminders.ts';
import Sheet from '../ui/Sheet';
import sheet from '../ui/Sheet.module.css';
import s from './Today.module.css';

/**
 * A special day's reminders, yours alone, every year: when (on the day, or days or weeks before) and
 * what to do then ("Pick up a present"). They come as alerts on your phone.
 */
export default function SpecialDayDialog({ day, onClose }: { day: SpecialDay; onClose: () => void }) {
	const mine = (useSpecialReminders().data ?? []).filter((r) => r.key === day.key);
	const { add, remove } = useChangeSpecialReminders();
	const push = usePush();
	const [before, setBefore] = useState<(typeof DAYS_BEFORE)[number]>(7);
	const [note, setNote] = useState('');
	const date = fromDayKey(day.day).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

	return (
		<Sheet
			label={day.name}
			onClose={onClose}
			onSubmit={(e) => {
				e.preventDefault();
				add.mutate(
					{ key: day.key, name: day.name, daysBefore: before, note: note.trim() || null },
					{ onSuccess: () => setNote('') },
				);
			}}
		>
			<div className={sheet.head}>
				<h2 className={sheet.heading}>
					{day.picture} {day.name}
				</h2>
				<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
					×
				</button>
			</div>
			<p className={s.specialDate}>{date}</p>

			<h3 className={s.specialSubhead}>Your reminders</h3>
			{mine.length === 0 ? (
				<p className={s.none}>None yet. They come round every year.</p>
			) : (
				<ul className={s.specialReminders}>
					{mine.map((r) => (
						<li key={r.id}>
							<span aria-hidden="true">🔔</span>
							<span className={s.what}>
								<span className={s.title}>{r.note ?? 'Reminder'}</span>
								<span className={s.where}>{beforeLabel(r.daysBefore)}</span>
							</span>
							<button
								type="button"
								className={s.specialRemove}
								aria-label={`Take off ${r.note ?? 'the reminder'}, ${beforeLabel(r.daysBefore).toLowerCase()}`}
								onClick={() => remove.mutate(r.id)}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}

			<h3 className={s.specialSubhead}>Add a reminder</h3>
			<div className={s.specialWhen} role="group" aria-label="When">
				{DAYS_BEFORE.map((n) => (
					<button key={n} type="button" aria-pressed={before === n} onClick={() => setBefore(n)}>
						{beforeLabel(n)}
					</button>
				))}
			</div>
			<input
				className={s.specialNote}
				value={note}
				onChange={(e) => setNote(e.target.value)}
				maxLength={200}
				placeholder="What to do then? (Pick up a present)"
				aria-label="What to do then"
			/>
			{(add.isError || remove.isError) && <p className={s.specialProblem}>{(add.error ?? remove.error)?.message}</p>}
			{push.state !== 'on' && push.state !== 'loading' && (
				<p className={s.none}>Reminders come as alerts: turn them on in Settings → Notifications on your phone.</p>
			)}
			<div className={sheet.actions}>
				<span className={sheet.spacer} />
				<button type="button" className={sheet.secondary} onClick={onClose}>
					Done
				</button>
				<button type="submit" className={sheet.primary} disabled={add.isPending}>
					Add reminder
				</button>
			</div>
		</Sheet>
	);
}
