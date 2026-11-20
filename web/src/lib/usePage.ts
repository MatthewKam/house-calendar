import { useCallback, useSyncExternalStore } from 'react';
import type { Page } from '../components/nav/NavBar';
import { PHONE } from './useMediaQuery';

/** Pages that live in the address after "#"; the calendar is the plain address. */
const PAGES: Page[] = ['calendar', 'today', 'tasks', 'rewards', 'lists', 'photos', 'recipes'];
const read = (): Page => {
	const hash = window.location.hash.slice(1) as Page;
	return PAGES.includes(hash) ? hash : 'calendar';
};
const subscribe = (onChange: () => void) => {
	window.addEventListener('hashchange', onChange);
	return () => window.removeEventListener('hashchange', onChange);
};

/**
 * The page on screen, kept in the address (#tasks, #lists) so a refresh stays on it, the browser's back
 * button returns to the previous page, and a bookmark can open straight to Tasks.
 */
/** Phones open on Today when the address names no page (a link to #tasks still opens Tasks). */
if (!window.location.hash && window.matchMedia(PHONE).matches) {
	history.replaceState(null, '', `${window.location.pathname}${window.location.search}#today`);
}

/** Where a link on another page brought us from (kept with this step in the browser's history), or null. */
const readFrom = (): Page | null => {
	const from = (history.state as { from?: Page } | null)?.from;
	return from && PAGES.includes(from) && from !== read() ? from : null;
};
const subscribeFrom = (onChange: () => void) => {
	window.addEventListener('hashchange', onChange);
	window.addEventListener('popstate', onChange);
	return () => {
		window.removeEventListener('hashchange', onChange);
		window.removeEventListener('popstate', onChange);
	};
};
const address = (page: Page) =>
	window.location.pathname + window.location.search + (page === 'calendar' ? '' : `#${page}`);

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
	const from = useSyncExternalStore(subscribeFrom, readFrom);
	const go = useCallback((next: Page) => {
		if (next === read()) return;
		// A new step with nothing to go back to; hashchange updates `page` (pushState doesn't send one).
		history.pushState(null, '', address(next));
		window.dispatchEvent(new HashChangeEvent('hashchange'));
	}, []);
	const follow = useCallback((next: Page) => {
		const here = read();
		if (next === here) return;
		history.pushState({ from: here }, '', address(next));
		window.dispatchEvent(new HashChangeEvent('hashchange'));
	}, []);
	const back = useCallback(() => history.back(), []);
	return { page, go, follow, from, back };
}
