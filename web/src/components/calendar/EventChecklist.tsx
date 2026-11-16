import { useState } from 'react';
import { suggestIcon } from '../../lib/emoji';
import { useSetChecklist, useTickChecklist } from '../../lib/queries';
import type { CalEvent, ChecklistItem } from '../../lib/types';
import Checklist from '../ui/Checklist';

/** Pictures to start from: what goes in a bag for a class, a game or a trip. */
const BRING_ICONS = [
	'🎒',
	'🥋',
	'👕',
	'👖',
	'🩳',
	'👟',
	'🧦',
	'🧥',
	'🧢',
	'💧',
	'🥨',
	'🍎',
	'🧴',
	'🥽',
	'🩴',
	'📚',
	'✏️',
	'⚽',
	'🩹',
	'💊',
];

/** "3 of 4 packed", or "All packed". */
export const packed = (list: ChecklistItem[]) => {
	const done = list.filter((x) => x.done).length;
	return done === list.length ? 'All packed' : `${done} of ${list.length} packed`;
};

/**
 * What to bring to an event: tick things off for this time (anyone can), or (not locked) change the
 * list, which is the same every time it repeats. Saves straight away, apart from the event's own Save.
 */
export default function EventChecklist({ event, locked }: { event: CalEvent; locked?: boolean }) {
	const tick = useTickChecklist();
	const save = useSetChecklist();
	// The sheet was opened with the event as it was then: the list as it is now is kept here.
	const [list, setList] = useState(event.checklist);
	return (
		<Checklist
			label="🎒 What to bring"
			name="What to bring"
			items={list}
			count={packed}
			editHint="Every time it repeats"
			footnote={`Ticks start fresh each time${event.repeats || event.calendarId !== 'local' ? ' it repeats' : ''}.`}
			locked={locked}
			busy={save.isPending}
			placeholder="Add a thing, e.g. belt or snack"
			itemLabel="Thing to bring"
			icons={BRING_ICONS}
			onTick={(x, done) => {
				setList(list.map((y) => (y.id === x.id ? { ...y, done } : y)));
				tick.mutate({ id: event.id, itemId: x.id, done }, { onError: () => setList(list) });
			}}
			onSave={(items) => {
				setList(items);
				// The saved list has the new ones' ids, to tick them by.
				save.mutate(
					{ id: event.id, items },
					{ onSuccess: (saved) => setList(saved.checklist), onError: () => setList(list) },
				);
			}}
		/>
	);
}

/** A picture for a thing to bring: its own, or a guess from its name, or a bag. */
export const bringPicture = (x: ChecklistItem) => x.picture ?? suggestIcon(x.title) ?? '🎒';
