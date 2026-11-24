import { useState } from 'react';
import { UNASSIGNED } from '../../lib/color';
import { percent, tasksFor, type taskProgress } from '../../lib/tasks';
import type { CalEvent, Member, Task } from '../../lib/types';
import { FilterChip } from '../ui/NameChip';
import s from './styles/PeopleFilter.module.css';

/** The filter for events that aren't for anyone in particular. */
export const EVERYONE = 'everyone';

/**
 * Whether an event shows with these filters (any number; none shows everything). A person shows every event
 * they're part of; Everyone shows events for no one in particular. An event shows if it matches any pick.
 */
export const eventShown = (focus: string[]) => (ev: CalEvent) =>
	focus.length === 0 || focus.some((f) => (f === EVERYONE ? ev.memberIds.length === 0 : ev.memberIds.includes(f)));

/**
 * The calendar's name filters. People with tasks are always shown, each filling with their colour as they
 * finish today's tasks; the rest (and Everyone) are behind the filter button, except whoever is picked
 * right now. Clear shows every event again. Folded (phones), every name is behind the filter button.
 */
export default function PeopleFilter({
	members,
	tasks,
	progress,
	focus,
	onFocus,
	folded = false,
}: {
	members: Member[];
	tasks: Task[];
	/** Today's tasks done and due, per person. */
	progress: ReturnType<typeof taskProgress>;
	focus: string[];
	onFocus: (focus: string[]) => void;
	/** Only the filter button, with every name in its pop-up (and Clear at the pop-up's top). */
	folded?: boolean;
}) {
	// The pop-up of names that aren't shown (people without tasks, and Everyone).
	const [moreOpen, setMoreOpen] = useState(false);
	const everyone = { id: EVERYONE, name: 'Everyone', color: UNASSIGNED };
	const withTasks = members.filter((m) => tasksFor(tasks, m.id).length > 0);
	// Until anyone has tasks, show everybody.
	const shownPeople = folded ? [] : withTasks.length ? [...withTasks] : [...members, everyone];
	const morePeople = folded
		? [...members, everyone]
		: withTasks.length
			? [...members.filter((m) => !withTasks.includes(m)), everyone]
			: [];
	// Picks from the pop-up show too, so it's clear the calendar is filtered (folded, the button is ringed).
	const hiddenPicked = morePeople.filter((m) => focus.includes(m.id));
	if (!folded) shownPeople.push(...hiddenPicked);

	const whoButton = (m: { id: string; name: string; color: string }) => {
		const p = progress.get(m.id);
		return (
			<FilterChip
				key={m.id}
				name={m.name}
				color={m.color}
				pct={percent(p)}
				on={focus.includes(m.id)}
				dimmed={focus.length > 0 && !focus.includes(m.id)}
				title={`${focus.includes(m.id) ? `Stop filtering by ${m.name}` : `Show ${m.name}'s events`}${p ? ` · tasks today: ${p.done} of ${p.due}` : ''}`}
				// Tap to add or remove a filter; the pop-up stays open so several can be picked.
				onClick={() => onFocus(focus.includes(m.id) ? focus.filter((f) => f !== m.id) : [...focus, m.id])}
			/>
		);
	};

	return (
		<div className={`${s.people} ${folded ? s.folded : ''}`}>
			{focus.length > 0 && !folded && (
				<button className={s.clearFilter} onClick={() => onFocus([])}>
					Clear
				</button>
			)}
			{shownPeople.map(whoButton)}
			{morePeople.length > 0 && (
				<div className={s.moreWrap}>
					<button
						className={`${s.moreButton} ${hiddenPicked.length ? s.moreOn : ''}`}
						aria-expanded={moreOpen}
						aria-label="More people"
						title="More people"
						onClick={() => setMoreOpen(!moreOpen)}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />
						</svg>
					</button>
					{moreOpen && (
						<>
							<div className={s.moreScrim} onClick={() => setMoreOpen(false)} role="presentation" />
							<div className={s.morePanel}>
								{folded && focus.length > 0 && (
									<button className={`${s.clearFilter} ${s.clearInPanel}`} onClick={() => onFocus([])}>
										Clear
									</button>
								)}
								{morePeople.map(whoButton)}
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}
