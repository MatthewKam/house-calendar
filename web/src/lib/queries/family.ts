// The family and the app: people, sign-in, calendars and their sync, and settings.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Member, SyncedCalendar, MemberPatch } from '../types';
import { showNow, putBack, REFRESH_MS, keys } from './shared';

export function useMembers() {
  return useQuery({ queryKey: keys.members, queryFn: api.members });
}

/**
 * Who this device is signed in as, its household, and whether a parent has unlocked it. A failed
 * check is tried once more, then shown (the sign-in screen handles it).
 */
export function useAuthStatus() {
  return useQuery({ queryKey: keys.auth, queryFn: api.authStatus, retry: 1 });
}

/** iCloud sync status; null when no account is set up. */
export function useSyncStatus() {
  return useQuery({ queryKey: keys.sync, queryFn: api.sync, refetchInterval: REFRESH_MS });
}

export function useCalendars() {
  return useQuery({ queryKey: keys.calendars, queryFn: api.calendars });
}

/** Linking or hiding a calendar changes which events show and in whose color. */
export function useUpdateCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<SyncedCalendar, 'memberId' | 'hidden' | 'visibility'>> }) =>
      api.updateCalendar(id, patch),
    onMutate: ({ id, patch }) =>
      qc.setQueryData(keys.calendars, (list: SyncedCalendar[] = []) => list.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: keys.calendars }),
      qc.invalidateQueries({ queryKey: keys.events }),
    ]),
  });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.settings });
}

export function useSetSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api.setSetting(key, value),
    onMutate: ({ key, value }) => qc.setQueryData(keys.settings, (s: Record<string, unknown> = {}) => ({ ...s, [key]: value })),
  });
}

/** Member changes can affect how events render (removed member -> unassigned), so refresh both. */
function useMemberMutation<T>(fn: (arg: T) => Promise<unknown>, show?: (arg: T, members: Member[]) => Member[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: (arg: T) => showNow(qc, show ? [{ key: keys.members, apply: (members: Member[]) => show(arg, members) }] : []),
    onError: putBack(qc),
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: keys.members }),
      qc.invalidateQueries({ queryKey: keys.events }),
      qc.invalidateQueries({ queryKey: keys.tasks }),
    ]),
  });
}

export const useUpdateMember = () =>
  useMemberMutation(({ id, patch }: { id: string; patch: MemberPatch }) =>
    api.updateMember(id, patch), ({ id, patch }, members) => members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
/** A new color: shown at once when it's made, or as asked for (waiting for the account holder). */
export const useSetMemberColor = () =>
  useMemberMutation(({ id, color }: { id: string; color: string; holder: boolean }) => api.setMemberColor(id, color),
    ({ id, color, holder }, members) => members.map((m) => (m.id !== id ? m : holder ? { ...m, color, colorAsked: null }
      : { ...m, colorAsked: color === m.color ? null : { color, by: m.colorAsked?.by ?? null } })));
export const useAnswerColor = () =>
  useMemberMutation(({ id, approve }: { id: string; approve: boolean }) => api.answerColor(id, approve),
    ({ id, approve }, members) => members.map((m) => (m.id !== id || !m.colorAsked ? m
      : { ...m, color: approve ? m.colorAsked.color : m.color, colorAsked: null })));
