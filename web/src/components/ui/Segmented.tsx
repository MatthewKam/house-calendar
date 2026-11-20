import type { ReactNode } from 'react';
import s from './Segmented.module.css';

interface Option<T extends string> {
	id: T;
	label: ReactNode;
	/** A quieter line under the label ("Required for the day"). */
	hint?: ReactNode;
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
}

/**
 * Two to four choices side by side in one bar, one picked (Task | Goal, Week | Month, Catch one |
 * History). For more, or several at once, use Chips.
 */
export function Segmented<T extends string>({ label, options, value, onChange, tabs, className }: Props<T>) {
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
						onClick={() => onChange(o.id)}
					>
						{o.label}
						{o.hint && <span className={s.hint}>{o.hint}</span>}
					</button>
				);
			})}
		</div>
	);
}
