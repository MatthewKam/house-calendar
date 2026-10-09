import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthStatus } from './api';

/** A parent's unlock ends after this long without a touch (unless the device is kept unlocked). */
const IDLE_MS = 5 * 60_000;

/**
 * The parent lock: whether this device may change things (events, tasks, jars, settings, photos,
 * lists), and unlocking it with the master PIN or locking it again. The server checks it too.
 */
export function useParent() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['auth'], queryFn: api.authStatus }).data;
  const set = (s: Pick<AuthStatus, 'parent' | 'parentKept'>) => qc.setQueryData<AuthStatus>(['auth'], (old) => old && { ...old, ...s });
  const unlock = useMutation({
    mutationFn: ({ pin, keep }: { pin: string; keep: boolean }) => api.unlockParent(pin, keep),
    // A wrong PIN is shown in the unlock pop-up, not as a toast.
    meta: { inline: true },
    onSuccess: set,
  });
  const lock = useMutation({ mutationFn: api.lockParent, onSuccess: set });
  // Until the status is in, nothing parent-only shows.
  return { parent: status?.parent ?? false, kept: status?.parentKept ?? false, pinSet: status?.pinSet ?? false, unlock, lock };
}

/**
 * Locks this device again after a few minutes without a touch, and when the screen saver comes on,
 * so a parent who forgets doesn't leave it open for the kids (a device kept unlocked stays so).
 */
export function useAutoLock(saverOn: boolean) {
  const { parent, kept, pinSet, lock } = useParent();
  const shouldLock = parent && !kept && pinSet;
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
