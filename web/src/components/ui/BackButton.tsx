import type { Page } from '../nav/NavBar';
import s from './styles/BackButton.module.css';

/** Each page's name on its Back button. */
const NAMES: Record<Page, string> = {
	today: 'Today',
	calendar: 'Calendar',
	tasks: 'Tasks',
	rewards: 'Rewards',
	lists: 'Lists',
	photos: 'Photos',
	recipes: 'Recipes',
};

/**
 * "‹ Today": back to the page a link came from (usePage's `from` and `back`). Shown above a page opened
 * by a link on another page, never after the nav bar, which is for the main pages themselves.
 */
export function BackButton({ to, onBack }: { to: Page; onBack: () => void }) {
	return (
		<button type="button" className={s.back} onClick={onBack} aria-label={`Back to ${NAMES[to]}`}>
			<svg viewBox="0 0 24 24" aria-hidden="true" className={s.chevron}>
				<path d="M15 5l-7 7 7 7" />
			</svg>
			<span>{NAMES[to]}</span>
		</button>
	);
}
