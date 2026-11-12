import { useState } from 'react';
import { useCalendars, useSetSetting, useSettings, useSyncStatus } from '../../lib/queries';

/**
 * Where a new event goes: an iCloud calendar (sent there, so it reaches the phones) or this wall only.
 * The last choice is remembered for next time, for every way of adding one (the event form, Snap a
 * flyer, Say it). `enabled`: false for an existing event, which stays where it is.
 */
export function useNewEventCalendar(enabled = true) {
	const canWrite = !!useSyncStatus().data?.canWrite;
	const calendars = (useCalendars().data ?? []).filter((c) => c.writable && !c.hidden);
	const saved = useSettings().data?.newEventCalendar as string | undefined;
	const setSetting = useSetSetting();
	const options = enabled && canWrite ? calendars : [];
	// Same-named calendars are told apart by one of their events.
	const label = (c: (typeof calendars)[number]) =>
		options.filter((o) => o.name === c.name).length > 1 && c.sample[0] ? `${c.name} (has “${c.sample[0]}”)` : c.name;
	const fallback = options[0]?.id ?? 'local';
	const initial = saved === 'local' || options.some((c) => c.id === saved) ? saved! : fallback;
	// null until picked, so the remembered choice can arrive after the form opens.
	const [picked, setPicked] = useState<string | null>(null);
	const chosen = picked ?? initial;
	return {
		options,
		label,
		chosen,
		pick: setPicked,
		/** What to send with a new event (nothing when there's no choice to make), remembering the choice. */
		forSave: (): { calendarId?: string } => {
			if (!options.length) return {};
			setSetting.mutate({ key: 'newEventCalendar', value: chosen });
			return { calendarId: chosen };
		},
	};
}

/** The calendar a new event goes to, as a select; nothing when there's no iCloud calendar to pick. */
export function CalendarPick({
	target,
	className,
}: {
	target: ReturnType<typeof useNewEventCalendar>;
	className?: string;
}) {
	if (!target.options.length) return null;
	return (
		<label className={className}>
			Calendar
			<select value={target.chosen} onChange={(e) => target.pick(e.target.value)}>
				{target.options.map((c) => (
					<option key={c.id} value={c.id}>
						{target.label(c)} (iCloud)
					</option>
				))}
				<option value="local">This wall only</option>
			</select>
		</label>
	);
}
