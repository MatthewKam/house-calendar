// The setup steps after starting a household (account/Setup.tsx) show on the device that started it, until
// they're finished or skipped. Remembered on this device only: if it's lost (a private window), the app just
// opens as usual and everything is still in Settings.

const KEY = 'sprig:setup';

export function startSetup(householdId: string) {
	try {
		localStorage.setItem(KEY, householdId);
	} catch {
		// Storage blocked: no setup steps, the app opens as usual.
	}
}

export function setupPending(householdId: string) {
	try {
		return localStorage.getItem(KEY) === householdId;
	} catch {
		return false;
	}
}

export function finishSetup() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing to forget.
	}
}
