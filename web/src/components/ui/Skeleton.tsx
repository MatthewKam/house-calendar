import type { CSSProperties, ReactNode } from 'react';
import s from './Skeleton.module.css';

// Loading: grey shapes where something is on its way, so a page never looks empty or broken while its
// data comes in. Read out once as "Loading" (the shapes themselves are hidden from screen readers).

/** One grey block: a line of text, a picture, a button. Sizes in any CSS length. */
export function Skeleton({
	width = '100%',
	height = '1rem',
	round,
	className,
}: {
	width?: string;
	height?: string;
	/** A circle or pill (an avatar, a chip). */
	round?: boolean;
	className?: string;
}) {
	return (
		<span
			className={`${s.block} ${round ? s.round : ''} ${className ?? ''}`}
			style={{ width, height } as CSSProperties}
			aria-hidden="true"
		/>
	);
}

/** Lines of text, the last one shorter, as a paragraph looks. */
export function SkeletonLines({ count = 3, height = '0.9rem' }: { count?: number; height?: string }) {
	return (
		<span className={s.lines} aria-hidden="true">
			{Array.from({ length: count }, (_, i) => (
				<Skeleton key={i} height={height} width={i === count - 1 && count > 1 ? '60%' : '100%'} />
			))}
		</span>
	);
}

/**
 * Something loading, read out as `label` ("Loading the weather"). `children` are its shapes; without
 * them, a few lines. `className` gives it the look of what it stands in for (a card's own class).
 */
export function Loading({ label, className, children }: { label: string; className?: string; children?: ReactNode }) {
	return (
		<div className={`${s.loading} ${className ?? ''}`} role="status" aria-label={label}>
			{children ?? <SkeletonLines />}
		</div>
	);
}
