import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type AuthStatus } from './api';
import { useAuthStatus } from './queries';

/** A parent's unlock ends after this long without a touch. */
const IDLE_MS = 5 * 60_000;

/**
 * The parent lock: whether this device may change things (events, tasks, jars, settings, photos,
 * lists). A guardian's own phone always may; the wall or a kid's device unlocks with any guardian's
 * PIN. The server checks it too.
 */
export function useParent() {
	const qc = useQueryClient();
	const status = useAuthStatus().data;
	const set = (s: AuthStatus) => qc.setQueryData(['auth'], s);
	const unlock = useMutation({
		mutationFn: ({ pin }: { pin: string }) => api.unlockParent(pin),
		// A wrong PIN is shown in the unlock pop-up, not as a toast.
		meta: { inline: true },
		onSuccess: set,
	});
	const lock = useMutation({ mutationFn: api.lockParent, onSuccess: set });
	const signedIn = status?.signedIn ? status : null;
	// Until the status is in, nothing parent-only shows.
	return { parent: signedIn?.parent ?? false, lockable: !!signedIn && !signedIn.parentAlways, unlock, lock };
}

/**
 * Locks this device again after a few minutes without a touch, and when the screen saver comes on,
 * so a parent who forgets doesn't leave it open for the kids (a guardian's own phone never locks).
 */
export function useAutoLock(saverOn: boolean) {
	const { parent, lockable, lock } = useParent();
	const shouldLock = parent && lockable;
	useEffect(() => {
		if (shouldLock && saverOn) lock.mutate();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [shouldLock, saverOn]);
	useEffect(() => {
		if (!shouldLock) return;
		let timer: ReturnType<typeof setTimeout>;
		const arm = () => {
			clearTimeout(timer);
			timer = setTimeout(() => lock.mutate(), IDLE_MS);
		};
		const events = ['pointerdown', 'keydown'] as const;
		events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
		arm();
		return () => {
			clearTimeout(timer);
			events.forEach((e) => window.removeEventListener(e, arm));
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [shouldLock]);
}
