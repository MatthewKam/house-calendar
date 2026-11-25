import { useCallback, useSyncExternalStore } from 'react';
import type { Page } from '../components/nav/NavBar';
import { PHONE } from './useMediaQuery';

/** Pages that live in the address after "#"; the calendar is the plain address. */
const PAGES: Page[] = ['calendar', 'today', 'tasks', 'rewards', 'lists', 'photos', 'recipes', 'settings'];

/**
 * Whether the nav bar's pages are steps to go back through (Back, a swipe, the browser's Back). Now they
 * aren't, like the tabs along the bottom of an iPhone app: only a link from one page to another is. Set
 * true to make every page change a step.
 */
const NAV_BAR_STEPS = false;

/**
 * What each step in the browser's history keeps: the page a link came from, how many steps deep (links
 * and screens opened over the page), and the screens open over the page (useBackStep), by key.
 */
export interface Step {
	from?: Page;
	depth?: number;
	open?: string[];
	/** The page's own ‹ Back is hidden (a screen over it shows it instead: hideBack). */
	quiet?: boolean;
	/** A group of Settings opened from its list on a phone (#settings/users): Back goes to the list. */
	group?: boolean;
}
export const step = (): Step => (history.state as Step | null) ?? {};

/** The screens open right now (useBackStep's keys); a step can name one that has since gone. */
export const liveScreens = new Set<string>();
const openHere = () => (step().open ?? []).filter((k) => liveScreens.has(k));

/** The nav bar's page, while going back past the link steps to put it in place of where they began. */
let landing: Page | null = null;
/** True while the nav bar is going back past the steps to its page (open screens close by themselves). */
export const leaving = () => landing !== null;

/** The address after "#": the page, then (Settings) a part of it: #settings/users. */
const hashParts = () => window.location.hash.slice(1).split('/');
const read = (): Page => {
	if (landing) return landing;
	const hash = hashParts()[0] as Page;
	return PAGES.includes(hash) ? hash : 'calendar';
};
const address = (page: Page) =>
	window.location.pathname + window.location.search + (page === 'calendar' ? '' : `#${page}`);
const changed = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// Back at the start of the links (see go): the nav bar's page takes that step's place.
window.addEventListener('popstate', () => {
	// Back onto the step of a screen that's gone (left by a link from inside it, like a recipe's "Open
	// the list"): nothing to show there, so on back past it.
	const open = step().open ?? [];
	if (!landing && open.length && !open.some((k) => liveScreens.has(k))) return history.back();
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
/** Where a link came from, shown or not. */
const linkFrom = (): Page | null => {
	const { from } = step();
	return !landing && from && PAGES.includes(from) && from !== read() ? from : null;
};
const readFrom = (): Page | null =>
	// A screen open over the page has its own way back (useBackStep), and a quiet page shows none.
	openHere().length || step().quiet ? null : linkFrom();

/** Whether there's a step to go back to: a link from another page, or a screen open over this one. */
export const canGoBack = () => linkFrom() !== null || (!landing && (openHere().length > 0 || !!step().group));
/** Whether a screen is open over the page (a recipe, Settings). */
export const screenOpen = () => openHere().length > 0;

/**
 * The page's own ‹ Back is hidden from now on, though going back works as before (a swipe, the browser's
 * Back): for a page under a screen that shows it instead, like Recipes under a meal's recipe.
 */
export function hideBack() {
	history.replaceState({ ...step(), quiet: true }, '', window.location.href);
	changed();
}

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

/**
 * Go to a page from a link on this one (Today's cards, a meal on the calendar, the + menu): the next page
 * shows ‹ Back. Usable anywhere, not only through usePage.
 */
export function follow(next: Page) {
	const here = read();
	if (next === here) return;
	// A new page: the screens open on this one aren't open on it.
	const s: Step = { from: here, depth: (step().depth ?? 0) + 1 };
	// pushState doesn't send hashchange, which updates `page`: send it.
	history.pushState(s, '', address(next));
	changed();
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
	const back = useCallback(() => history.back(), []);
	return { page, go, follow, from, back };
}

/** The group of Settings in the address (#settings/users: "users"), or null for none. */
const readGroup = (): string | null => (read() === 'settings' ? (hashParts()[1] ?? null) || null : null);
const settingsAddress = (group: string | null) =>
	window.location.pathname + window.location.search + (group ? `#settings/${group}` : '#settings');

export interface SettingsGroup {
	/** The group in the address ("users"), or null for the list of groups. */
	group: string | null;
	/**
	 * Show a group. `step`: one to go back through (a phone, from the list of groups to one); otherwise
	 * in place of the one showing (a bigger screen, where the list stays beside it).
	 */
	open: (group: string, step: boolean) => void;
	/** Back to the list of groups (a phone's ‹ Settings): the step back, or in place if there's none. */
	close: () => void;
}

/** Settings' groups, each with an address of its own (#settings/users), so a link or a refresh opens it. */
export function useSettingsGroup(): SettingsGroup {
	const group = useSyncExternalStore(subscribe, readGroup);
	const open = useCallback((next: string, asStep: boolean) => {
		if (next === readGroup()) return;
		if (asStep && !step().group) {
			history.pushState({ depth: (step().depth ?? 0) + 1, group: true }, '', settingsAddress(next));
		} else {
			history.replaceState(step(), '', settingsAddress(next));
		}
		changed();
	}, []);
	const close = useCallback(() => {
		if (step().group) return history.back();
		history.replaceState(step(), '', settingsAddress(null));
		changed();
	}, []);
	return { group, open, close };
}
