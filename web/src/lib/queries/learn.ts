// Learn: each kid's games and level, the day's limit, and the recorded animal noises.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Game, LearnDayChange } from '../types';
import { keys } from './shared';

/** Each kid's learning (on or off, and their games' levels). */
export function useLearn(today: string) {
  return useQuery({ queryKey: keys.learn(today), queryFn: () => api.learn(today) });
}

/** Animal noises a grown-up recorded for the games. */
export function useLearnSounds() {
  return useQuery({ queryKey: ['learnSounds'], queryFn: api.learnSounds });
}

/** Recording an animal's noise (or deleting it, to go back to the built-in one). */
export function useSetLearnSound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ animal, audio }: { animal: string; audio: Blob | null }) => {
      if (audio) await api.recordLearnSound(animal, audio);
      else await api.deleteLearnSound(animal);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['learnSounds'] }),
  });
}

/** A guardian turning learning on or off for a kid, or moving a game's level. */
export function useSetLearn(today: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, ...p }: { memberId: string; enabled?: boolean; gamesADay?: number; minutesADay?: number | null;
      levels?: Partial<Record<Game, number>> }) => api.setLearn(memberId, today, p),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.learn(today) }),
  });
}

/** A grown-up unlocking or locking a kid's Learn today, or giving more games or minutes. */
export function useChangeLearnDay(today: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, ...change }: { memberId: string } & LearnDayChange) => api.changeLearnDay(memberId, today, change),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.learn(today) }),
  });
}
