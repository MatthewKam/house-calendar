import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './api';
import { addDays, dayKey } from './dates';
import type { TaskDone, TaskInput, EventInput, Member, SyncedCalendar, MemberPatch, Task, RewardInput, CalEvent, Reward, RewardWin, Bucket, StarPlacing,
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
  // Under 'tasksDone' too, so ticking a task refreshes the buckets.
  rewards: (today: string) => ['tasksDone', 'rewards', today] as const,
  rewardHistory: ['tasksDone', 'rewards', 'history'] as const,
  buckets: ['tasksDone', 'rewards', 'buckets'] as const,
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
    // Tasks too: a one-time task's done day comes with it.
    onSettled: () => Promise.all([keys.tasksDone, keys.tasks].map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaskInput }) => (id ? api.updateTask(id, input) : api.addTask(input)),
    onMutate: ({ id, input }) => showNow(qc, [{ key: keys.tasks, apply: (tasks: Task[]) => id
      ? tasks.map((t) => (t.id === id ? { ...t, ...input } : t))
      : [...tasks, { ...input, id: newId('task'), sortOrder: tasks.length, createdAt: new Date().toISOString(), doneOn: {} } as Task] }]),
    onError: putBack(qc),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  });
}

/** Reward jars still going (filling, earned or missed), as of `today`. */
export function useRewards(today: string) {
  return useQuery({ queryKey: keys.rewards(today), queryFn: () => api.rewards(today), refetchInterval: REFRESH_MS });
}

/** Every jar filled or missed (waiting to be redeemed first, then the rest, newest first). */
export function useRewardHistory() {
  return useQuery({ queryKey: keys.rewardHistory, queryFn: api.rewardHistory, refetchInterval: REFRESH_MS });
}

/** Stars each kid can still put in jars. Ticks refresh them too. */
export function useBuckets() {
  return useQuery({ queryKey: keys.buckets, queryFn: api.buckets, refetchInterval: REFRESH_MS });
}

/** Add, change, fill, redeem and delete jars; each refreshes the jars, buckets and history afterwards. */
export function useRewardActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['tasksDone', 'rewards'] });
  // The jar lists are the ones keyed by a day (not the history or buckets).
  const jars = (apply: (list: Reward[]) => Reward[]): Patch =>
    ({ key: ['tasksDone', 'rewards'], skip: (k) => !/^\d{4}-/.test(String(k[2] ?? '')), apply });
  const history = (apply: (list: RewardWin[]) => RewardWin[]): Patch => ({ key: keys.rewardHistory, apply });
  const buckets = (apply: (list: Bucket[]) => Bucket[]): Patch => ({ key: keys.buckets, apply });
  const mutation = <V>(mutationFn: (v: V) => Promise<unknown>, patches: (v: V) => Patch[]) => useMutation({
    mutationFn,
    onMutate: (v: V) => showNow(qc, patches(v)),
    onError: putBack(qc),
    onSettled: refresh,
  });
  const redeemed = (id: string, givenAt: string | null) => [history((wins) => wins.map((w) => (w.id === id ? { ...w, givenAt } : w)))];
  return {
    save: mutation(({ id, reward, today }: { id?: string; reward: RewardInput; today: string }) =>
      (id ? api.updateReward(id, reward, today) : api.addReward(reward, today)),
    ({ id, reward }) => [jars((list) => id
      ? list.map((r) => (r.id === id ? { ...r, ...reward } : r))
      : [...list, { ...reward, id: newId('reward'), stars: 0, memberStars: {}, status: 'filling' }])]),
    /** Stars into jars: out of the bucket (or the missed jar they're moved from) and into each jar. */
    place: mutation((p: StarPlacing) => api.placeStars(p), ({ memberId, from, places }) => {
      const spent = places.reduce((a, x) => a + x.stars, 0);
      const freed = from
        ? qc.getQueriesData<Reward[]>({ queryKey: ['tasksDone', 'rewards'] }).flatMap(([, d]) => (Array.isArray(d) ? d : []))
          .find((r) => r.id === from)?.memberStars[memberId] ?? 0
        : 0;
      return [
        buckets((list) => list.map((b) => (b.memberId === memberId ? { ...b, stars: b.stars + freed - spent } : b))),
        jars((list) => list.map((r) => {
          const n = (r.id === from ? -(r.memberStars[memberId] ?? 0) : 0) +
            places.filter((x) => x.rewardId === r.id).reduce((a, x) => a + x.stars, 0);
          return n ? { ...r, stars: r.stars + n, memberStars: { ...r.memberStars, [memberId]: (r.memberStars[memberId] ?? 0) + n } } : r;
        })),
      ];
    }),
    restore: mutation(({ id, deadline, today }: { id: string; deadline: string | null; today: string }) => api.restoreReward(id, deadline, today),
      ({ id, deadline }) => [jars((list) => list.map((r) => (r.id === id ? { ...r, deadline, status: 'filling' as const } : r)))]),
    /** A parent takes a kid's stars back out of a jar (with the master PIN). A wrong PIN is shown in its dialog, not as a toast. */
    takeBack: useMutation({
      mutationFn: ({ id, memberId, stars, pin }: { id: string; memberId: string; stars: number; pin: string }) =>
        api.takeBack(id, memberId, stars, pin),
      meta: { inline: true },
      onSettled: refresh,
    }),
    redeem: mutation((id: string) => api.redeem(id), (id) => redeemed(id, new Date().toISOString())),
    undoRedeem: mutation((id: string) => api.undoRedeem(id), (id) => redeemed(id, null)),
    remove: mutation((id: string) => api.removeReward(id), (id) => [jars((list) => list.filter((r) => r.id !== id))]),
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
