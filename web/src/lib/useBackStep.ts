import { useEffect, useRef } from 'react';
import { leaving, liveScreens, step } from './usePage';

// A screen opened over a page (a recipe, Settings and its parts) is a step of its own in the browser's
// history, so Back, a swipe and the browser's Back close it before leaving the page. Closing it in the
// app (its ×, ‹ Settings) takes the step away again, so the next Back goes where it would have.

const inStack = (key: string) => step().open?.includes(key) ?? false;

// Screens closed in the app, whose steps go together in one jump back (Settings closing with one of its
// parts open takes two).
const closing = new Set<string>();
let flushing = false;
function takeAway(key: string) {
	closing.add(key);
	if (flushing) return;
	flushing = true;
	window.setTimeout(() => {
		flushing = false;
		const open = step().open ?? [];
		// Only the steps on top: one under a screen still open stays (going back to it would close that).
		let n = 0;
		while (n < open.length && closing.has(open[open.length - 1 - n])) n++;
		closing.clear();
		if (n && !leaving()) history.go(-n);
	}, 0);
}

/** While `open`, a step in the history; going back past it calls `close`. */
export function useBackStep(open: boolean, close: () => void) {
	const closeRef = useRef(close);
	closeRef.current = close;
	const key = useRef<string | null>(null);
	const pendingBack = useRef<number | null>(null);

	useEffect(() => {
		if (!open) return;
		// Opened again straight away (React's checks while developing run this twice): keep the step.
		if (pendingBack.current !== null) {
			clearTimeout(pendingBack.current);
			pendingBack.current = null;
		}
		if (!key.current || !inStack(key.current)) {
			const mine = Math.random().toString(36).slice(2);
			const s = step();
			history.pushState(
				{ ...s, depth: (s.depth ?? 0) + 1, open: [...(s.open ?? []), mine] },
				'',
				window.location.href,
			);
			key.current = mine;
		}
		const mine = key.current;
		liveScreens.add(mine);
		const onPop = () => {
			if (inStack(mine)) return;
			key.current = null;
			closeRef.current();
		};
		window.addEventListener('popstate', onPop);
		return () => {
			window.removeEventListener('popstate', onPop);
			liveScreens.delete(mine);
			// Closed in the app: take its step away (unless it's opening again, or the nav bar is already
			// going back past it).
			pendingBack.current = window.setTimeout(() => {
				pendingBack.current = null;
				if (key.current !== mine || !inStack(mine) || leaving()) return;
				key.current = null;
				takeAway(mine);
			}, 0);
		};
	}, [open]);
}
