import { useEffect, type RefObject } from 'react';
import { isApp } from './native';

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

/** While `on` (there's somewhere to go back to), a swipe from the left edge of `ref` calls `onBack`. */
export function useEdgeSwipe(ref: RefObject<HTMLElement | null>, on: boolean, onBack: () => void) {
	useEffect(() => {
		const el = ref.current;
		if (!el || !on || !homeScreen()) return;
		let start: { x: number; y: number; t: number } | null = null;
		// Sideways (true) once it's clearly a swipe; up and down (false) leaves it to scrolling.
		let sideways: boolean | null = null;
		let dx = 0;

		const slide = (x: number, animate: boolean) => {
			el.style.transition = animate ? 'transform 0.2s ease-out' : '';
			el.style.transform = x ? `translateX(${x}px)` : '';
		};
		const down = (e: TouchEvent) => {
			const t = e.touches[0];
			if (e.touches.length !== 1 || t.clientX > EDGE) return;
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
			if (sideways && (dx > el.clientWidth / 3 || flick)) {
				slide(el.clientWidth, true);
				window.setTimeout(() => {
					onBack();
					slide(0, false);
				}, 200);
			} else if (sideways) slide(0, true);
			start = null;
		};

		el.addEventListener('touchstart', down, { passive: true });
		el.addEventListener('touchmove', move, { passive: false });
		el.addEventListener('touchend', up);
		el.addEventListener('touchcancel', up);
		return () => {
			el.removeEventListener('touchstart', down);
			el.removeEventListener('touchmove', move);
			el.removeEventListener('touchend', up);
			el.removeEventListener('touchcancel', up);
			slide(0, false);
		};
	}, [ref, on, onBack]);
}
