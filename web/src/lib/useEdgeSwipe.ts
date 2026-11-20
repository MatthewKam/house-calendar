import { useEffect, type RefObject } from 'react';
import { isApp } from './native';
import { canGoBack, screenOpen } from './usePage';

// Swipe back from the left edge, on Sprig added to the Home Screen: there the phone has no swipe of its
// own. The page follows the finger and goes back past a third of the way (or a quick flick); short of
// that it slides home again. In Safari the browser's own swipe does it, and in the iPhone app iOS's
// (AppViewController), so this stays out of their way.

/** How near the left edge a swipe starts, in px. */
const EDGE = 24;

const homeScreen = () =>
	!isApp &&
	(window.matchMedia('(display-mode: standalone)').matches ||
		(navigator as { standalone?: boolean }).standalone === true);

/**
 * A swipe from the left edge calls `onBack` when there's somewhere to go back to (usePage's canGoBack).
 * The page (`ref`) follows the finger; a screen open over it (a recipe, Settings) just closes at the end.
 */
export function useEdgeSwipe(ref: RefObject<HTMLElement | null>, onBack: () => void) {
	useEffect(() => {
		const page = ref.current;
		if (!page || !homeScreen()) return;
		// What follows the finger: the page, or nothing while a screen is open over it.
		let el: HTMLElement | null = null;
		let start: { x: number; y: number; t: number } | null = null;
		// Sideways (true) once it's clearly a swipe; up and down (false) leaves it to scrolling.
		let sideways: boolean | null = null;
		let dx = 0;

		const slide = (x: number, animate: boolean) => {
			if (!el) return;
			el.style.transition = animate ? 'transform 0.2s ease-out' : '';
			el.style.transform = x ? `translateX(${x}px)` : '';
		};
		const down = (e: TouchEvent) => {
			const t = e.touches[0];
			if (e.touches.length !== 1 || t.clientX > EDGE || !canGoBack()) return;
			el = screenOpen() ? null : page;
			start = { x: t.clientX, y: t.clientY, t: e.timeStamp };
			sideways = null;
			dx = 0;
		};
		const move = (e: TouchEvent) => {
			if (!start) return;
			const t = e.touches[0];
			dx = Math.max(0, t.clientX - start.x);
			const dy = Math.abs(t.clientY - start.y);
			if (sideways === null && (dx > 10 || dy > 10)) sideways = dx > dy;
			if (!sideways) return;
			e.preventDefault();
			slide(dx, false);
		};
		const up = (e: TouchEvent) => {
			if (!start) return;
			const flick = dx > 40 && dx / Math.max(1, e.timeStamp - start.t) > 0.5;
			const width = window.innerWidth;
			if (sideways && (dx > width / 3 || flick)) {
				slide(width, true);
				window.setTimeout(() => {
					onBack();
					slide(0, false);
				}, 200);
			} else if (sideways) slide(0, true);
			start = null;
		};

		// The whole window: a screen open over the page isn't inside it.
		window.addEventListener('touchstart', down, { passive: true });
		window.addEventListener('touchmove', move, { passive: false });
		window.addEventListener('touchend', up);
		window.addEventListener('touchcancel', up);
		return () => {
			window.removeEventListener('touchstart', down);
			window.removeEventListener('touchmove', move);
			window.removeEventListener('touchend', up);
			window.removeEventListener('touchcancel', up);
			slide(0, false);
		};
	}, [ref, onBack]);
}
