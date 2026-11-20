import { useId, type HTMLAttributes, type ReactNode } from 'react';
import s from './Card.module.css';

type Tone = 'plain' | 'info' | 'warn' | 'good' | 'danger';

interface Props extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
	/** Its small heading in capitals ("THE KIDS TODAY"), which also names it for screen readers. */
	title?: ReactNode;
	/** Beside the heading, on the right: a Hide, an Edit, a ⋯. */
	action?: ReactNode;
	/** A box in a tone: a note to know (info), a heads-up (warn), all done (good), something wrong (danger). */
	tone?: Tone;
	children: ReactNode;
}

/**
 * A card on a page: a box of one thing (today's events, a kid's tasks, a note), with its heading and an
 * action on top when it has them. Cards sit `--space-5` apart; inside, their parts `--space-3`.
 */
export function Card({ title, action, tone = 'plain', className, children, ...rest }: Props) {
	const id = useId();
	const classes = [s.card, s[tone], className].filter(Boolean).join(' ');
	return (
		<section className={classes} aria-labelledby={title ? id : undefined} {...rest}>
			{(title || action) && (
				<div className={s.head}>
					{title && (
						<h2 id={id} className={s.title}>
							{title}
						</h2>
					)}
					{action && <div className={s.action}>{action}</div>}
				</div>
			)}
			{children}
		</section>
	);
}

/**
 * A heading for part of a page or a sheet ("Groceries", "This week"), with an action on the right when
 * there is one. `level` keeps the page's headings in order (2 under the page's title, 3 inside a part).
 */
export function SectionHead({
	children,
	action,
	level = 2,
}: {
	children: ReactNode;
	action?: ReactNode;
	level?: 2 | 3;
}) {
	const Heading = level === 2 ? 'h2' : 'h3';
	return (
		<div className={s.sectionHead}>
			<Heading className={level === 2 ? s.section : s.subsection}>{children}</Heading>
			{action && <div className={s.action}>{action}</div>}
		</div>
	);
}
