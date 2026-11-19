// The setup steps after starting a household (account/Setup.tsx) show on the device that started it, until
// they're finished or skipped; a guardian who joins gets just the calendar step, for their own phone. Remembered on this device only: if it's lost (a private window), the app just
// opens as usual and everything is still in Settings.

const KEY = 'sprig:setup';

/** Started a household (every step), or joined one (just sharing your own calendars). */
export type SetupKind = 'started' | 'joined';

export function startSetup(householdId: string, kind: SetupKind = 'started') {
	try {
		localStorage.setItem(KEY, JSON.stringify({ householdId, kind }));
	} catch {
		// Storage blocked: no setup steps, the app opens as usual.
	}
}

/** Which setup this device still has to show for this household, or null. */
export function setupPending(householdId: string): SetupKind | null {
	try {
		const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { householdId: string; kind: SetupKind } | null;
		return kept?.householdId === householdId ? kept.kind : null;
	} catch {
		return null;
	}
}

export function finishSetup() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing to forget.
	}
}
