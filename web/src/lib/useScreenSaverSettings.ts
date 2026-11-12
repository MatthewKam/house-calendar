import { useEffect, useState } from 'react';
import { useSettings } from './queries';
import { screenSaverSettings } from './screensaver';
import type { ScreenSaverSettings } from './types';

/**
 * The screen saver's settings for this device (Settings, Screen): kept on the device, so the kitchen
 * tablet and a computer each have their own. Until they're changed here, the household's old shared ones
 * (from before they were per device). Which photos it shows is still the family's (the Photos page).
 */
const KEY = 'sprig:screensaver';

function load(): unknown {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? 'null');
	} catch {
		return null;
	}
}

export function useScreenSaverSettings() {
	const household = useSettings().data?.screensaver;
	const [mine, setMine] = useState(load);
	useEffect(() => {
		const update = () => setMine(load());
		window.addEventListener(KEY, update);
		return () => window.removeEventListener(KEY, update);
	}, []);
	const settings = screenSaverSettings(mine ?? household);
	const save = (patch: Partial<ScreenSaverSettings>) => {
		const next = { ...settings, ...patch };
		try {
			localStorage.setItem(KEY, JSON.stringify(next));
		} catch {
			// Private browsing or storage blocked: just this visit.
		}
		setMine(next);
		window.dispatchEvent(new Event(KEY));
	};
	return [settings, save] as const;
}
