import type { ButtonHTMLAttributes, ReactNode } from 'react';
import s from './Chip.module.css';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
	/** Picked: filled with the accent. Leave it out for a chip that just does something when tapped. */
	pressed?: boolean;
	/** A picture before the words. */
	icon?: ReactNode;
}

/**
 * A pill to tap: a filter or a choice among a few (Mia, Leo; Breakfast, Dinner; Today, Tomorrow). Picked
 * ones are filled. Several in a row sit `--space-2` apart and wrap.
 */
export function Chip({ pressed, icon, className, type = 'button', children, ...rest }: ChipProps) {
	return (
		<button type={type} className={[s.chip, className].filter(Boolean).join(' ')} aria-pressed={pressed} {...rest}>
			{icon !== undefined && (
				<span className={s.icon} aria-hidden="true">
					{icon}
				</span>
			)}
			<span>{children}</span>
		</button>
	);
}

type Tone = 'plain' | 'accent' | 'info' | 'warn' | 'good' | 'danger' | 'soon';

/** A small label that isn't pressed: a recipe's kind, "New", "Busy", a count. */
export function Tag({ tone = 'plain', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
	return <span className={[s.tag, s[tone], className].filter(Boolean).join(' ')}>{children}</span>;
}
