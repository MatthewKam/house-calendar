import { useCallback, useSyncExternalStore } from 'react';
import type { Page } from '../components/NavBar';

/** Pages that live in the address after "#"; the calendar is the plain address. */
const PAGES: Page[] = ['calendar', 'tasks', 'rewards', 'lists'];
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
export function usePage(): [Page, (page: Page) => void] {
  const page = useSyncExternalStore(subscribe, read);
  const setPage = useCallback((next: Page) => {
    if (next === read()) return;
    // Setting the hash adds a history entry and fires hashchange, which updates `page`.
    if (next === 'calendar') history.pushState(null, '', window.location.pathname + window.location.search);
    else window.location.hash = next;
    if (next === 'calendar') window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);
  return [page, setPage];
}
