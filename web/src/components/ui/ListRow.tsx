import type { ReactNode } from 'react';
import s from './ListRow.module.css';

/** A list of rows (ListRow), `--space-2` apart. `divided` draws a line between them instead. */
export function List({
	children,
	divided,
	label,
	className,
}: {
	children: ReactNode;
	divided?: boolean;
	/** What the list is, for screen readers, when no heading above says. */
	label?: string;
	className?: string;
}) {
	return (
		<ul className={[s.list, divided && s.divided, className].filter(Boolean).join(' ')} aria-label={label}>
			{children}
		</ul>
	);
}

interface RowProps {
	/** On the left: a person's dot, a picture, an avatar. */
	leading?: ReactNode;
	/** Its name. */
	title: ReactNode;
	/** A second, quieter line: a time, an email, how it's set. */
	detail?: ReactNode;
	/** On the right: a Switch, a button, a count. */
	trailing?: ReactNode;
	/** Tapping the row (its picture and words) does this; what's in `trailing` is pressed on its own. */
	onClick?: () => void;
	/** Faded: turned off, or someone else's. */
	muted?: boolean;
}

/** One row of a List: who or what it is on the left, what you can do with it on the right. */
export function ListRow({ leading, title, detail, trailing, onClick, muted }: RowProps) {
	const main = (
		<>
			{leading !== undefined && (
				<span className={s.leading} aria-hidden={typeof leading === 'string' || undefined}>
					{leading}
				</span>
			)}
			<span className={s.words}>
				<span className={s.title}>{title}</span>
				{detail && <span className={s.detail}>{detail}</span>}
			</span>
		</>
	);
	return (
		<li className={[s.row, muted && s.muted].filter(Boolean).join(' ')}>
			{onClick ? (
				<button type="button" className={s.main} onClick={onClick}>
					{main}
				</button>
			) : (
				<div className={s.main}>{main}</div>
			)}
			{trailing !== undefined && <div className={s.trailing}>{trailing}</div>}
		</li>
	);
}
