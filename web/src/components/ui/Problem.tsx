import { problemText } from '../../lib/api';
import s from './Problem.module.css';

/**
 * Something that went wrong, said plainly, with a way to try again. `kind`: a card's own small box, a
 * whole page's, or the kids' (a picture and a big button: nothing that looks like failing).
 */
export default function Problem({
	message,
	onRetry,
	retryLabel = 'Try again',
	kind = 'card',
	className,
	onLeave,
}: {
	message: string;
	onRetry?: () => void;
	retryLabel?: string;
	kind?: 'card' | 'page' | 'kid';
	className?: string;
	/** Kid mode broke as a whole: the grown-ups' way out (it asks for a PIN, as Exit does). */
	onLeave?: () => void;
}) {
	if (kind === 'kid') {
		return (
			<div className={`${s.kid} ${className ?? ''}`} role="alert">
				<span className={s.kidPicture} aria-hidden="true">
					🌱
				</span>
				{onRetry && (
					<button type="button" className={s.kidButton} onClick={onRetry}>
						Let's try again
					</button>
				)}
				{onLeave && (
					<button type="button" className={s.retry} onClick={onLeave}>
						Grown-ups: leave kid mode
					</button>
				)}
			</div>
		);
	}
	return (
		<div className={`${kind === 'page' ? s.page : s.card} ${className ?? ''}`} role="alert">
			<p className={s.message}>{message}</p>
			{onRetry && (
				<button type="button" className={s.retry} onClick={onRetry}>
					{retryLabel}
				</button>
			)}
		</div>
	);
}

/** Something that couldn't load, in words: the reason when it's one to show (problemText), else just that. */
export function loadProblem(what: string, error: Error | null) {
	const why = problemText(error, '');
	return why ? `Couldn't load ${what}: ${why}` : `Couldn't load ${what}.`;
}
