import { useCalendars, useUpdateCalendar } from '../../lib/queries';
import { UNASSIGNED } from '../../lib/color';
import type { Member, Visibility } from '../../lib/types';
import s from './CalendarList.module.css';

/** Synced calendars: whose each one is, who sees its events, and whether it shows on the wall. */
export default function CalendarList({ members }: { members: Member[] }) {
	const calendars = useCalendars().data ?? [];
	const update = useUpdateCalendar();
	if (calendars.length === 0) return null;

	return (
		<section className={s.section}>
			<p className={s.hint}>
				Link a calendar to a person and all its events are theirs. Leave it on <b>By event</b> to pick per event, with
				Claude sorting new ones by title. <b>Sees</b> is who sees its events unless an event says otherwise: Busy shows
				others only the time; Private hides them from anyone not on them (guardians still see the kids').
			</p>
			<ul className={s.list}>
				{calendars.map((c) => (
					<li key={c.id} className={`${s.row} ${c.hidden ? s.off : ''}`}>
						<span className={s.dot} style={{ background: c.color ?? UNASSIGNED }} title="Color in Apple Calendar" />
						<div className={s.info}>
							<div className={s.name}>
								{c.name} <span className={s.count}>· {c.events} events</span>
							</div>
							{c.sample.length > 0 && <div className={s.sample}>{c.sample.join(' · ')}</div>}
						</div>
						<select
							className={s.who}
							value={c.memberId ?? ''}
							disabled={c.hidden}
							aria-label={`Who ${c.name} is for`}
							onChange={(e) => update.mutate({ id: c.id, patch: { memberId: e.target.value || null } })}
						>
							<option value="">By event</option>
							{members.map((m) => (
								<option key={m.id} value={m.id}>
									{m.name}
								</option>
							))}
						</select>
						<select
							className={s.who}
							value={c.visibility}
							disabled={c.hidden}
							aria-label={`Who sees ${c.name}'s events`}
							onChange={(e) => update.mutate({ id: c.id, patch: { visibility: e.target.value as Visibility } })}
						>
							<option value="everyone">Sees: everyone</option>
							<option value="busy">Sees: busy only</option>
							<option value="private">Sees: private</option>
						</select>
						<label className={s.show}>
							<input
								type="checkbox"
								checked={!c.hidden}
								onChange={(e) => update.mutate({ id: c.id, patch: { hidden: !e.target.checked } })}
							/>
							Show
						</label>
					</li>
				))}
			</ul>
			{update.isError && <p className={s.problem}>Couldn't save: {update.error.message}</p>}
		</section>
	);
}
