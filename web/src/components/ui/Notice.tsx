import type { ReactNode } from 'react';
import s from './Notice.module.css';

type Tone = 'info' | 'warn' | 'danger';

/**
 * A one-line note across the top of a page: something wrong or waiting ("Calendar sync failed"), small,
 * so it doesn't crowd what's under it. With `details`, a tap opens the rest (the reason, what to do).
 */
export function Notice({
	tone = 'warn',
	icon,
	title,
	details,
}: {
	tone?: Tone;
	icon?: ReactNode;
	title: ReactNode;
	details?: ReactNode;
}) {
	const head = (
		<>
			{icon !== undefined && (
				<span className={s.icon} aria-hidden="true">
					{icon}
				</span>
			)}
			<span className={s.title}>{title}</span>
		</>
	);
	return details ? (
		<details className={`${s.notice} ${s[tone]}`} role="status">
			<summary className={s.head}>
				{head}
				<span className={s.more} aria-hidden="true">
					Details
				</span>
			</summary>
			<p className={s.details}>{details}</p>
		</details>
	) : (
		<div className={`${s.notice} ${s[tone]}`} role="status">
			<div className={s.head}>{head}</div>
		</div>
	);
}
