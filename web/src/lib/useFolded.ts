import { useState } from 'react';

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
	/** Folds (or opens) each of `ids`. */
	const fold = (ids: string[], on: boolean) => {
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
