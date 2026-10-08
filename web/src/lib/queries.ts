import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './api';
import { addDays, dayKey, fromDayKey, startOfWeek } from './dates';
import type { TaskDone, TaskInput, EventInput, Member, SyncedCalendar, MemberPatch, Task, RewardInput, CalEvent, Reward, RewardWin,
  ReminderList, Photo, LeaveAlert, OutboxStatus } from './types';

// ---- Edits show straight away ---------------------------------------------------------------
// Every edit changes what's on screen first (the cached data), then saves in the background. If
// the save fails, the screen is put back and the app says so (main.tsx); either way, the data is
// fetched again afterwards so it ends up exactly as the server has it.

interface Patch {
  key: QueryKey;
  /** Leave some matching queries alone (e.g. the reward history, which has a different shape). */
  skip?: (key: QueryKey) => boolean;
  apply: (old: any) => unknown;
}
type Before = { before: [QueryKey, unknown][] };

/** Changes each matching cached query now, remembering how it was. */
async function showNow(qc: QueryClient, patches: Patch[]): Promise<Before> {
  const before: [QueryKey, unknown][] = [];
  for (const p of patches) {
    // A fetch already on its way would bring back the old data over the change.
    await qc.cancelQueries({ queryKey: p.key });
    for (const [key, data] of qc.getQueriesData({ queryKey: p.key })) {
      if (data === undefined || p.skip?.(key)) continue;
      before.push([key, data]);
      qc.setQueryData(key, p.apply(data));
    }
  }
  return { before };
}
/** The save failed: put the screen back as it was. */
const putBack = (qc: QueryClient) => (_e: Error, _v: unknown, ctx?: Before) =>
  ctx?.before.forEach(([key, data]) => qc.setQueryData(key, data));
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const isHistory = (key: QueryKey) => key[2] === 'history';

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
    onMutate: ({ id, input }) => showNow(qc, [{ key: keys.tasks, apply: (tasks: Task[]) => id
      ? tasks.map((t) => (t.id === id ? { ...t, ...input } : t))
      : [...tasks, { ...input, id: newId('task'), sortOrder: tasks.length, createdAt: new Date().toISOString() } as Task] }]),
    onError: putBack(qc),
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
  const rewards = (apply: (list: Reward[]) => Reward[]): Patch => ({ key: ['tasksDone', 'rewards'], skip: (k) => isHistory(k) || k.length < 3, apply });
  const history = (apply: (list: RewardWin[]) => RewardWin[]): Patch => ({ key: ['tasksDone', 'rewards', 'history'], apply });
  const now = () => new Date().toISOString();
  /** Handed over: a monthly reward shows as given for this month; an until-earned one leaves the list. */
  const handOver = (r: Reward) => (r.mode === 'monthly' ? [{ ...r, status: 'given' as const }] : []);
  return {
    save: useMutation({
      mutationFn: ({ id, reward }: { id?: string; reward: RewardInput }) => {
        const { startDay, ...changes } = reward;
        return id ? api.updateReward(id, changes) : api.addReward({ ...changes, startDay });
      },
      onMutate: ({ id, reward }) => showNow(qc, [rewards((list) => id
        ? list.map((r) => (r.id === id ? { ...r, ...reward, startDay: r.startDay } : r))
        : [...list, { ...reward, id: newId('reward'), stars: 0, memberStars: {}, status: 'in_progress', winId: null, earnedDay: null }])]),
      onError: putBack(qc),
      onSettled: refresh,
    }),
    give: useMutation({
      mutationFn: ({ id, today }: { id: string; today: string }) => api.giveReward(id, today),
      onMutate: ({ id }) => {
        const winId = qc.getQueriesData<Reward[]>({ queryKey: ['tasksDone', 'rewards'] }).flatMap(([k, d]) => (isHistory(k) || !d ? [] : d))
          .find((r) => r.id === id)?.winId;
        return showNow(qc, [rewards((list) => list.flatMap((r) => (r.id === id ? handOver(r) : [r]))),
          history((wins) => wins.map((w) => (w.id === winId ? { ...w, givenAt: now() } : w)))]);
      },
      onError: putBack(qc),
      onSettled: refresh,
    }),
    giveWin: useMutation({
      mutationFn: ({ id, today }: { id: string; today: string }) => api.giveWin(id, today),
      onMutate: ({ id }) => showNow(qc, [rewards((list) => list.flatMap((r) => (r.winId === id ? handOver(r) : [r]))),
        history((wins) => wins.map((w) => (w.id === id ? { ...w, givenAt: now() } : w)))]),
      onError: putBack(qc),
      onSettled: refresh,
    }),
    undoWin: useMutation({
      mutationFn: (id: string) => api.undoWin(id),
      onMutate: (id) => showNow(qc, [history((wins) => wins.map((w) => (w.id === id ? { ...w, givenAt: null } : w)))]),
      onError: putBack(qc),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.removeReward(id),
      onMutate: (id) => showNow(qc, [rewards((list) => list.filter((r) => r.id !== id))]),
      onError: putBack(qc),
      onSettled: refresh,
    }),
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
    onMutate: (id) => showNow(qc, [{ key: keys.tasks, apply: (tasks: Task[]) => tasks.filter((t) => t.id !== id) }]),
    onError: putBack(qc),
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
  const items = (apply: (l: ReminderList) => ReminderList): Patch =>
    ({ key: keys.reminders, apply: (d: { enabled: boolean; lists: ReminderList[] }) => ({ ...d, lists: d.lists.map(apply) }) });
  return {
    add: useMutation({
      mutationFn: ({ list, title }: { list: string; title: string }) => api.addReminder(list, title),
      onMutate: ({ list, title }) => showNow(qc, [items((l) => (l.title === list
        ? { ...l, items: [...l.items.filter((i) => !i.done), { id: newId('w'), title, done: false, due: null, pending: true }, ...l.items.filter((i) => i.done)] }
        : l))]),
      onError: putBack(qc),
      onSuccess: replace,
    }),
    setDone: useMutation({
      mutationFn: ({ id, done }: { id: string; done: boolean }) => api.setReminderDone(id, done),
      onMutate: ({ id, done }) => showNow(qc, [items((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, done, pending: true } : i)) }))]),
      onError: putBack(qc),
      onSuccess: replace,
    }),
    rename: useMutation({
      mutationFn: ({ id, title }: { id: string; title: string }) => api.renameReminder(id, title),
      onMutate: ({ id, title }) => showNow(qc, [items((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, title, pending: true } : i)) }))]),
      onError: putBack(qc),
      onSuccess: replace,
    }),
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
  const gone = (id: string) => showNow(qc, [{ key: ['alerts'], apply: (list: LeaveAlert[]) => list.filter((x) => x.id !== id) }]);
  return {
    add: useMutation({ mutationFn: ({ eventId, minutesBefore }: { eventId: string; minutesBefore: number }) =>
      api.addAlert(eventId, minutesBefore), onSettled: refresh }),
    dismiss: useMutation({ mutationFn: (id: string) => api.dismissAlert(id), onMutate: (id) => gone(id), onError: putBack(qc), onSettled: refresh }),
    cancel: useMutation({ mutationFn: (id: string) => api.cancelAlert(id), onMutate: (id) => gone(id), onError: putBack(qc), onSettled: refresh }),
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
    onMutate: ({ id, input }) => {
      const { scope: _scope, calendarId, ...details } = input;
      return showNow(qc, [{ key: keys.events, apply: (list: CalEvent[]) => id
        ? list.map((e) => (e.id === id ? { ...e, ...details, location: details.location ?? null,
          syncState: e.calendarId === 'local' ? e.syncState : 'pending_update' } : e))
        : [...list, { ...details, id: newId('event'), calendarId: calendarId ?? 'local', location: details.location ?? null,
          syncState: calendarId && calendarId !== 'local' ? 'pending_create' : 'synced', repeats: false }] }]);
    },
    onError: putBack(qc),
    // An iCloud event's edit also changes what's waiting to be sent.
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: keys.events }), qc.invalidateQueries({ queryKey: ['outbox'] })]),
  });
}

export function useSetPeople() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memberIds }: { id: string; memberIds: string[] }) => api.setPeople(id, memberIds),
    onMutate: ({ id, memberIds }) => showNow(qc, [{ key: keys.events, apply: (list: CalEvent[]) => list.map((e) => (e.id === id ? { ...e, memberIds } : e)) }]),
    onError: putBack(qc),
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
    onMutate: ({ id }) => showNow(qc, [{ key: ['outbox'], apply: (o: OutboxStatus) => ({ ...o, conflicts: o.conflicts.filter((c) => c.id !== id) }) }]),
    onError: putBack(qc),
    onSuccess: (status) => qc.setQueryData(['outbox'], status),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.events }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope }: { id: string; scope?: 'one' | 'all' }) => api.removeEvent(id, scope),
    onMutate: ({ id, scope }) => showNow(qc, [{ key: keys.events, apply: (list: CalEvent[]) => {
      const gone = list.find((e) => e.id === id);
      // Every day of a repeating event: the others with its title in the same calendar go too.
      return list.filter((e) => e.id !== id && !(scope === 'all' && gone?.repeats && e.repeats && e.calendarId === gone.calendarId && e.title === gone.title));
    } }]),
    onError: putBack(qc),
    // An iCloud event's edit also changes what's waiting to be sent.
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: keys.events }), qc.invalidateQueries({ queryKey: ['outbox'] })]),
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

export const useAddMember = () => useMemberMutation((m: { name: string; color: string }) => api.addMember(m));
export const useUpdateMember = () =>
  useMemberMutation(({ id, patch }: { id: string; patch: MemberPatch }) =>
    api.updateMember(id, patch), ({ id, patch }, members) => members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
export const useRemoveMember = () => useMemberMutation((id: string) => api.removeMember(id));

/** The photo album, newest first. */
export function usePhotos() {
  return useQuery({ queryKey: ['photos'], queryFn: api.photos, refetchInterval: 5 * 60_000 });
}

export function usePhotoActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['photos'] });
  const photos = (apply: (list: Photo[]) => Photo[]) => showNow(qc, [{ key: ['photos'], apply }]);
  return {
    refresh,
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: { inSlideshow?: boolean; memberId?: string | null } }) => api.updatePhoto(id, patch),
      onMutate: ({ id, patch }) => photos((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p))),
      onError: putBack(qc),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.deletePhoto(id),
      onMutate: (id) => photos((list) => list.filter((p) => p.id !== id)),
      onError: putBack(qc),
      onSettled: refresh,
    }),
    /** Several at once (Select mode). */
    setSlideshow: useMutation({
      mutationFn: ({ ids, inSlideshow }: { ids: string[]; inSlideshow: boolean }) => api.setSlideshow(ids, inSlideshow),
      onMutate: ({ ids, inSlideshow }) => photos((list) => list.map((p) => (ids.includes(p.id) ? { ...p, inSlideshow } : p))),
      onError: putBack(qc),
      onSettled: refresh,
    }),
    removeMany: useMutation({
      mutationFn: (ids: string[]) => api.deletePhotos(ids),
      onMutate: (ids) => photos((list) => list.filter((p) => !ids.includes(p.id))),
      onError: putBack(qc),
      onSettled: refresh,
    }),
  };
}

/** The day's joke, quote and "on this day" (fetched once a day by the server). */
export function useDaily(day: string) {
  return useQuery({ queryKey: ['daily', day], queryFn: () => api.daily(day), refetchInterval: 30 * 60_000, retry: false });
}
