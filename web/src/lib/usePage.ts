import { useCallback, useSyncExternalStore } from 'react';
import type { Page } from '../components/nav/NavBar';
import { PHONE } from './useMediaQuery';

/** Pages that live in the address after "#"; the calendar is the plain address. */
const PAGES: Page[] = ['calendar', 'today', 'tasks', 'rewards', 'lists', 'photos', 'recipes'];

/**
 * Whether the nav bar's pages are steps to go back through (Back, a swipe, the browser's Back). Now they
 * aren't, like the tabs along the bottom of an iPhone app: only a link from one page to another is. Set
 * true to make every page change a step.
 */
const NAV_BAR_STEPS = false;

/** What each step in the browser's history keeps: the page a link came from, and how many links deep. */
interface Step {
	from?: Page;
	depth?: number;
}
const step = (): Step => (history.state as Step | null) ?? {};

/** The nav bar's page, while going back past the link steps to put it in place of where they began. */
let landing: Page | null = null;

const read = (): Page => {
	if (landing) return landing;
	const hash = window.location.hash.slice(1) as Page;
	return PAGES.includes(hash) ? hash : 'calendar';
};
const address = (page: Page) =>
	window.location.pathname + window.location.search + (page === 'calendar' ? '' : `#${page}`);
const changed = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// Back at the start of the links (see go): the nav bar's page takes that step's place.
window.addEventListener('popstate', () => {
	if (!landing) return;
	history.replaceState(null, '', address(landing));
	landing = null;
	changed();
});

const subscribe = (onChange: () => void) => {
	window.addEventListener('hashchange', onChange);
	window.addEventListener('popstate', onChange);
	return () => {
		window.removeEventListener('hashchange', onChange);
		window.removeEventListener('popstate', onChange);
	};
};

// The page on screen, kept in the address (#tasks, #lists) so a refresh stays on it and a bookmark can open
// straight to Tasks. A link from one page to another is a step in the browser's history, so Back, a swipe
// and the browser's Back return to where it was; the nav bar's pages aren't (NAV_BAR_STEPS).

/** Phones open on Today when the address names no page (a link to #tasks still opens Tasks). */
if (!window.location.hash && window.matchMedia(PHONE).matches) {
	history.replaceState(null, '', `${window.location.pathname}${window.location.search}#today`);
}

/** Where a link on another page brought us from (kept with this step in the browser's history), or null. */
const readFrom = (): Page | null => {
	const from = step().from;
	return !landing && from && PAGES.includes(from) && from !== read() ? from : null;
};

export interface Pages {
	/** The page on screen. */
	page: Page;
	/** Go to a page from the nav bar: a main page of its own, no way "back" shown. */
	go: (page: Page) => void;
	/** Go to a page from a link on this one (Today's cards, the + menu): the next page shows Back. */
	follow: (page: Page) => void;
	/** The page a link came from, while on the page it opened; null after the nav bar. */
	from: Page | null;
	/** Back to `from` (the browser's own Back, so its history stays the same as the app's). */
	back: () => void;
}

export function usePage(): Pages {
	const page = useSyncExternalStore(subscribe, read);
	const from = useSyncExternalStore(subscribe, readFrom);
	const go = useCallback((next: Page) => {
		if (next === read()) return;
		if (NAV_BAR_STEPS) {
			history.pushState(null, '', address(next));
			return changed();
		}
		// Not a step: in place of this one. After links, first back to where they began (the steps after
		// it are then dropped by the next one), so a swipe on the nav bar's page doesn't go back into them.
		const depth = step().depth ?? 0;
		if (depth > 0) {
			landing = next;
			changed();
			history.go(-Math.min(depth, history.length - 1));
			// If the browser didn't go back (nothing there after all), put the page in place here instead.
			setTimeout(() => {
				if (landing !== next) return;
				history.replaceState(null, '', address(next));
				landing = null;
				changed();
			}, 500);
			return;
		}
		history.replaceState(null, '', address(next));
		changed();
	}, []);
	const follow = useCallback((next: Page) => {
		const here = read();
		if (next === here) return;
		const s: Step = { from: here, depth: (step().depth ?? 0) + 1 };
		// pushState doesn't send hashchange, which updates `page`: send it.
		history.pushState(s, '', address(next));
		changed();
	}, []);
	const back = useCallback(() => history.back(), []);
	return { page, go, follow, from, back };
}
