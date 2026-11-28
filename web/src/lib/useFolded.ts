import { useState } from 'react';
import { feel } from './haptics';

/**
 * What's folded away (by id), remembered on this device under `storageKey`: the Tasks page's groups.
 * Without storage (private browsing, or blocked), just for this visit.
 */
export function useFolded(storageKey: string) {
	const [folded, setFolded] = useState<string[]>(() => {
		try {
			const ids = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
			return Array.isArray(ids) ? ids : [];
		} catch {
			return [];
		}
	});
	/** Folds (or opens) each of `ids`, with a tick (lib/haptics) unless `quiet` (opened along with something else). */
	const fold = (ids: string[], on: boolean, quiet = false) => {
		if (!quiet) feel('select');
		const next = on ? [...new Set([...folded, ...ids])] : folded.filter((id) => !ids.includes(id));
		setFolded(next);
		try {
			localStorage.setItem(storageKey, JSON.stringify(next));
		} catch {
			// Storage blocked: it's kept until the page closes.
		}
	};
	return { isFolded: (id: string) => folded.includes(id), fold };
}

/** The week's whole-day events folded to thin bars, or open: kept on this device (the wide week and the
 *  tablet carousel share it; phones always start folded). */
export function useAllDayFolded() {
	const folds = useFolded('sprig:week-all-day-folded');
	return [folds.isFolded('week'), (on: boolean) => folds.fold(['week'], on)] as const;
}
