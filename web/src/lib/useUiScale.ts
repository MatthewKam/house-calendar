import { useEffect, useState } from 'react';

/**
 * How big the text is on this device (Settings, Appearance): Small, Regular or Large, kept on the device,
 * like light or dark, so the wall's big text doesn't make the phones' big too. Regular until one's picked;
 * a size from the old slider that isn't one of them (90%, 140%…) or the household's old shared setting counts as Regular too.
 */
const KEY = 'sprig:ui-scale';

/** The three sizes, as a share of the 18px base (app.css's sizes are in rem). */
export const UI_SCALES = [
	{ id: '0.75', label: 'Small' },
	{ id: '0.85', label: 'Regular' },
	{ id: '1', label: 'Large' },
] as const;
/** Until one's picked. */
const REGULAR = 0.85;
const isStep = (n: number) => UI_SCALES.some((s) => Number(s.id) === n);

function load(): number | null {
	try {
		const n = Number(localStorage.getItem(KEY));
		return isStep(n) ? n : null;
	} catch {
		return null;
	}
}

export function useUiScale() {
	const [mine, setMine] = useState(load);
	useEffect(() => {
		const update = () => setMine(load());
		window.addEventListener(KEY, update);
		return () => window.removeEventListener(KEY, update);
	}, []);
	const set = (next: number) => {
		try {
			localStorage.setItem(KEY, String(next));
		} catch {
			// Private browsing or storage blocked: just this visit.
		}
		setMine(next);
		window.dispatchEvent(new Event(KEY));
	};
	return [mine ?? REGULAR, set] as const;
}
