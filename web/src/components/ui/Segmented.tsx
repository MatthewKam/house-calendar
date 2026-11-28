import type { ReactNode } from 'react';
import { feel, type Feel } from '../../lib/haptics';
import s from './styles/Segmented.module.css';

interface Option<T extends string> {
	id: T;
	label: ReactNode;
	/** A quieter line under the label ("Required for the day"). */
	hint?: ReactNode;
	/** Working on it (finding where you are): marked aria-busy, for its label to show it. */
	busy?: boolean;
}

interface Props<T extends string> {
	/** What's being picked, read out ("Task or goal", "History period"). */
	label: string;
	options: Option<T>[];
	value: T;
	onChange: (id: T) => void;
	/** It switches what's shown under it (Catch one | History): read out as tabs. */
	tabs?: boolean;
	className?: string;
	/** How a change feels (lib/haptics): a tick, unless it says otherwise (History's Week | Month taps);
	 *  null when what it changes gives its own (Today's days). */
	haptic?: Feel | null;
	/** None can be picked just now. */
	disabled?: boolean;
}

/**
 * Two to four choices side by side in one bar, one picked (Task | Goal, Week | Month, Catch one |
 * History, Today | Tomorrow | Rest of the week, On the day | Before). Every choice like these is one: not
 * pills or tabs of a screen's own. For more, or several at once, use Chips.
 */
export function Segmented<T extends string>({
	label,
	options,
	value,
	onChange,
	tabs,
	className,
	haptic = 'select',
	disabled,
}: Props<T>) {
	return (
		<div className={[s.bar, className].filter(Boolean).join(' ')} role={tabs ? 'tablist' : 'group'} aria-label={label}>
			{options.map((o) => {
				const on = o.id === value;
				return (
					<button
						key={o.id}
						type="button"
						className={s.option}
						role={tabs ? 'tab' : undefined}
						aria-selected={tabs ? on : undefined}
						aria-pressed={tabs ? undefined : on}
						aria-busy={o.busy || undefined}
						disabled={disabled}
						onClick={() => {
							if (o.id !== value && haptic) feel(haptic);
							onChange(o.id);
						}}
					>
						{o.label}
						{o.hint && <span className={s.hint}>{o.hint}</span>}
					</button>
				);
			})}
		</div>
	);
}
