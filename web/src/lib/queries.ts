import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { addDays, dayKey, fromDayKey, startOfWeek } from './dates';
import type { TaskDone, TaskInput, EventInput, Member, SyncedCalendar, MemberPatch, Task, RewardInput } from './types';

const REFRESH_MS = 60_000;

export const keys = {
  members: ['members'] as const,
  events: ['events'] as const,
  range: (from: Date, days: number) => ['events', dayKey(from), days] as const,
  settings: ['settings'] as const,
  sync: ['sync'] as const,
  calendars: ['calendars'] as const,
  tasks: ['tasks'] as const,
  reminders: ['reminders'] as const,
  tasksDone: ['tasksDone'] as const,
  tasksRange: (from: Date, days: number) => ['tasksDone', dayKey(from), days] as const,
  taskPoints: (today: string) => ['tasksDone', 'points', today] as const,
  // Under 'tasksDone' too, so ticking a task refreshes reward progress.
  rewards: (today: string) => ['tasksDone', 'rewards', today] as const,
};

export function useMembers() {
  return useQuery({ queryKey: keys.members, queryFn: api.members });
}

/** Events overlapping the `days` local days starting at `from`. */
export function useRangeEvents(from: Date, days: number) {
  return useQuery({
    queryKey: keys.range(from, days),
    queryFn: () => {
      const to = addDays(from, days);
      return api.events(from, to, dayKey(from), dayKey(to));
    },
    refetchInterval: REFRESH_MS,
    // Keep showing the old range while the next one loads, so paging doesn't flash empty.
    placeholderData: keepPreviousData,
  });
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
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<SyncedCalendar, 'memberId' | 'hidden'>> }) =>
      api.updateCalendar(id, patch),
    onMutate: ({ id, patch }) =>
      qc.setQueryData(keys.calendars, (list: SyncedCalendar[] = []) => list.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: keys.calendars }),
      qc.invalidateQueries({ queryKey: keys.events }),
    ]),
  });
}

export function useTasks() {
  return useQuery({ queryKey: keys.tasks, queryFn: api.tasks });
}

/** Check-offs for the 7 days starting at `weekStart`. Refreshes so other screens' taps show up. */
/** Ticks for the `days` local days starting at `from` (a week by default, or a whole month). */
export function useTasksDone(from: Date, days = 7) {
  return useQuery({
    queryKey: keys.tasksRange(from, days),
    queryFn: () => api.tasksDone(dayKey(from), dayKey(addDays(from, days))),
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

/** Ticks a task on or off, showing the change before the server answers. */
/** Each person's points from extras this week (from Sunday) and this month, up to and including today. */
export function useTaskPoints(today: string) {
  return useQuery({
    queryKey: keys.taskPoints(today),
    queryFn: () => {
      const day = fromDayKey(today);
      return api.taskPoints(dayKey(startOfWeek(day)), dayKey(new Date(day.getFullYear(), day.getMonth(), 1)), dayKey(addDays(day, 1)));
    },
    refetchInterval: REFRESH_MS,
  });
}

/** Ticks a task on or off, updating the `from`/`days` range on screen straight away. */
export function useSetTaskDone(from: Date, days = 7) {
  const qc = useQueryClient();
  const key = keys.tasksRange(from, days);
  return useMutation({
    mutationFn: ({ taskId, memberId, day, done }: TaskDone & { done: boolean }) =>
      api.setTaskDone(taskId, memberId, day, done),
    onMutate: async ({ taskId, memberId, day, done }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<TaskDone[]>(key);
      qc.setQueryData<TaskDone[]>(key, (list = []) =>
        done ? [...list, { taskId, memberId, day }]
          : list.filter((d) => !(d.taskId === taskId && d.memberId === memberId && d.day === day)));
      return { before };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.before),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasksDone }),
  });
}

export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaskInput }) => (id ? api.updateTask(id, input) : api.addTask(input)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  });
}

/** Rewards still on the cards, with stars counted as of `today`. */
export function useRewards(today: string) {
  return useQuery({ queryKey: keys.rewards(today), queryFn: () => api.rewards(today), refetchInterval: REFRESH_MS });
}

/** Every reward earned (waiting to be given first, then given, newest first). Ticks refresh it too. */
export function useRewardHistory() {
  return useQuery({ queryKey: ['tasksDone', 'rewards', 'history'], queryFn: api.rewardHistory, refetchInterval: REFRESH_MS });
}

/** Add, change, hand over and delete rewards; each refreshes the rewards and their history afterwards. */
export function useRewardActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['tasksDone', 'rewards'] });
  return {
    save: useMutation({
      mutationFn: ({ id, reward }: { id?: string; reward: RewardInput }) => {
        const { startDay, ...changes } = reward;
        return id ? api.updateReward(id, changes) : api.addReward({ ...changes, startDay });
      },
      onSettled: refresh,
    }),
    give: useMutation({ mutationFn: ({ id, today }: { id: string; today: string }) => api.giveReward(id, today), onSettled: refresh }),
    giveWin: useMutation({ mutationFn: ({ id, today }: { id: string; today: string }) => api.giveWin(id, today), onSettled: refresh }),
    undoWin: useMutation({ mutationFn: (id: string) => api.undoWin(id), onSettled: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api.removeReward(id), onSettled: refresh }),
  };
}

/** Saves a new order for all tasks, showing it straight away. */
export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.reorderTasks(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      const before = qc.getQueryData<Task[]>(keys.tasks);
      if (before) {
        const byId = new Map(before.map((t) => [t.id, t]));
        qc.setQueryData<Task[]>(keys.tasks, ids.map((id) => byId.get(id)).filter((t): t is Task => !!t));
      }
      return { before };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.tasks, ctx?.before),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeTask(id),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  });
}

/** Reminders lists; refreshed often so a phone's sync shows up soon after it runs. */
export function useReminders() {
  return useQuery({ queryKey: keys.reminders, queryFn: api.reminders, refetchInterval: 30_000 });
}

/** Adding or ticking an item: the server answers with the updated lists, which replace the cache. */
export function useChangeReminders() {
  const qc = useQueryClient();
  const replace = (r: { lists: unknown }) =>
    qc.setQueryData(keys.reminders, (old: { enabled: boolean } | undefined) => ({ enabled: old?.enabled ?? true, lists: r.lists }));
  return {
    add: useMutation({ mutationFn: ({ list, title }: { list: string; title: string }) => api.addReminder(list, title), onSuccess: replace }),
    setDone: useMutation({ mutationFn: ({ id, done }: { id: string; done: boolean }) => api.setReminderDone(id, done), onSuccess: replace }),
    rename: useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => api.renameReminder(id, title), onSuccess: replace }),
  };
}

/** Weather at home; the server asks for fresh numbers every 10 minutes. */
export function useWeather() {
  return useQuery({ queryKey: ['weather'], queryFn: api.weather, refetchInterval: 10 * 60_000, retry: false });
}

/** "Time to leave" alerts; checked often so the wall shows one on time. */
export function useAlerts() {
  return useQuery({ queryKey: ['alerts'], queryFn: api.alerts, refetchInterval: 30_000 });
}

export function useAlertActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['alerts'] });
  return {
    add: useMutation({ mutationFn: ({ eventId, minutesBefore }: { eventId: string; minutesBefore: number }) =>
      api.addAlert(eventId, minutesBefore), onSettled: refresh }),
    dismiss: useMutation({ mutationFn: (id: string) => api.dismissAlert(id), onSettled: refresh }),
    cancel: useMutation({ mutationFn: (id: string) => api.cancelAlert(id), onSettled: refresh }),
  };
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

export function useSaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: EventInput }) =>
      id ? api.updateEvent(id, input) : api.addEvent(input),
    // An iCloud event's edit also changes what's waiting to be sent.
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: keys.events }), qc.invalidateQueries({ queryKey: ['outbox'] })]),
  });
}

export function useSetPeople() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memberIds }: { id: string; memberIds: string[] }) => api.setPeople(id, memberIds),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
  });
}

/** Undo for deleting an iCloud event (before the delete is sent). */
export function useRestoreEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restoreEvent(id),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
  });
}

/** Wall edits waiting for iCloud and conflicts to settle; checked often, and after every edit. */
export function useOutbox() {
  return useQuery({ queryKey: ['outbox'], queryFn: api.outbox, refetchInterval: 20_000 });
}

export function useResolveConflict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keep }: { id: number; keep: 'mine' | 'theirs' }) => api.resolveConflict(id, keep),
    onSuccess: (status) => qc.setQueryData(['outbox'], status),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeEvent(id),
    // An iCloud event's edit also changes what's waiting to be sent.
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: keys.events }), qc.invalidateQueries({ queryKey: ['outbox'] })]),
  });
}

/** Member changes can affect how events render (removed member -> unassigned), so refresh both. */
function useMemberMutation<T>(fn: (arg: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: keys.members }),
      qc.invalidateQueries({ queryKey: keys.events }),
      qc.invalidateQueries({ queryKey: keys.tasks }),
    ]),
  });
}

export const useAddMember = () => useMemberMutation((m: { name: string; color: string }) => api.addMember(m));
export const useUpdateMember = () =>
  useMemberMutation(({ id, patch }: { id: string; patch: MemberPatch }) =>
    api.updateMember(id, patch));
export const useRemoveMember = () => useMemberMutation((id: string) => api.removeMember(id));

/** The photo album, newest first. */
export function usePhotos() {
  return useQuery({ queryKey: ['photos'], queryFn: api.photos, refetchInterval: 5 * 60_000 });
}

export function usePhotoActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['photos'] });
  return {
    refresh,
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: { inSlideshow?: boolean; memberId?: string | null } }) => api.updatePhoto(id, patch),
      onSettled: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.deletePhoto(id), onSettled: refresh }),
    /** Several at once (Select mode). */
    setSlideshow: useMutation({
      mutationFn: ({ ids, inSlideshow }: { ids: string[]; inSlideshow: boolean }) => api.setSlideshow(ids, inSlideshow),
      onSettled: refresh,
    }),
    removeMany: useMutation({ mutationFn: (ids: string[]) => api.deletePhotos(ids), onSettled: refresh }),
  };
}
