import type { CalEvent, LeaveAlert, MemberPatch, Reward, Task, Trip, TaskDone, TaskInput, EventInput, Member, ReminderList, SyncedCalendar, SyncStatus, TaskPoints, Weather, OutboxStatus, RewardInput, RewardWin } from './types';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error ?? j.message, () => res.statusText);
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  members: () => call<Member[]>('GET', '/api/members'),
  addMember: (m: { name: string; color: string }) => call<Member>('POST', '/api/members', m),
  updateMember: (id: string, m: MemberPatch) => call<Member>('PATCH', `/api/members/${id}`, m),
  removeMember: (id: string) => call<void>('DELETE', `/api/members/${id}`),

  events: (from: Date, to: Date, fromDay: string, toDay: string) =>
    call<CalEvent[]>('GET', `/api/events?${new URLSearchParams({
      from: from.toISOString(), to: to.toISOString(), fromDay, toDay,
    })}`),
  addEvent: (e: EventInput) => call<CalEvent>('POST', '/api/events', e),
  updateEvent: (id: string, e: Partial<EventInput>) => call<CalEvent>('PATCH', `/api/events/${id}`, e),
  /** Drive time from home and when to leave (Google Maps, on the server). */
  travel: (id: string) => call<Trip>('GET', `/api/events/${id}/travel`),
  weather: () => call<Weather>('GET', '/api/weather'),
  alerts: () => call<LeaveAlert[]>('GET', '/api/alerts'),
  addAlert: (eventId: string, minutesBefore: number) => call<LeaveAlert>('POST', '/api/alerts', { eventId, minutesBefore }),
  dismissAlert: (id: string) => call<void>('POST', `/api/alerts/${id}/dismiss`),
  cancelAlert: (id: string) => call<void>('DELETE', `/api/alerts/${id}`),
  removeEvent: (id: string) => call<void>('DELETE', `/api/events/${id}`),
  restoreEvent: (id: string) => call<CalEvent>('POST', `/api/events/${id}/restore`),
  outbox: () => call<OutboxStatus>('GET', '/api/outbox'),
  resolveConflict: (id: number, keep: 'mine' | 'theirs') => call<OutboxStatus>('POST', `/api/outbox/${id}/resolve`, { keep }),
  /** Who a synced event is for; covers every repeat of it. */
  setPeople: (id: string, memberIds: string[]) => call<CalEvent>('PUT', `/api/events/${id}/people`, { memberIds }),

  sync: () => call<SyncStatus | null>('GET', '/api/sync'),
  calendars: () => call<SyncedCalendar[]>('GET', '/api/calendars'),
  updateCalendar: (id: string, patch: Partial<Pick<SyncedCalendar, 'memberId' | 'hidden'>>) =>
    call<SyncedCalendar>('PATCH', `/api/calendars/${id}`, patch),

  tasks: () => call<Task[]>('GET', '/api/tasks'),
  addTask: (c: TaskInput) => call<Task>('POST', '/api/tasks', c),
  updateTask: (id: string, c: Partial<TaskInput>) => call<Task>('PATCH', `/api/tasks/${id}`, c),
  removeTask: (id: string) => call<void>('DELETE', `/api/tasks/${id}`),
  rewards: (today: string) => call<Reward[]>('GET', `/api/rewards?${new URLSearchParams({ today })}`),
  rewardHistory: () => call<RewardWin[]>('GET', '/api/rewards/history'),
  addReward: (r: RewardInput) => call<Reward>('POST', '/api/rewards', r),
  updateReward: (id: string, r: Partial<Omit<RewardInput, 'startDay'>>) => call<Reward>('PATCH', `/api/rewards/${id}`, r),
  giveReward: (id: string, today: string) => call<void>('POST', `/api/rewards/${id}/given?${new URLSearchParams({ today })}`),
  giveWin: (id: string, today: string) => call<void>('POST', `/api/rewards/wins/${id}/given?${new URLSearchParams({ today })}`),
  undoWin: (id: string) => call<void>('POST', `/api/rewards/wins/${id}/undo`),
  removeReward: (id: string) => call<void>('DELETE', `/api/rewards/${id}`),
  /** Saves a new task order (all task ids, in order). */
  reorderTasks: (ids: string[]) => call<Task[]>('PUT', '/api/tasks/order', { ids }),
  taskPoints: (week: string, month: string, to: string) =>
    call<TaskPoints[]>('GET', `/api/tasks/points?${new URLSearchParams({ week, month, to })}`),
  tasksDone: (from: string, to: string) => call<TaskDone[]>('GET', `/api/tasks/done?${new URLSearchParams({ from, to })}`),
  setTaskDone: (id: string, memberId: string, day: string, done: boolean) =>
    call<void>(done ? 'PUT' : 'DELETE', `/api/tasks/${id}/done/${memberId}/${day}`),

  reminders: () => call<{ enabled: boolean; lists: ReminderList[] }>('GET', '/api/reminders'),
  addReminder: (list: string, title: string) => call<{ lists: ReminderList[] }>('POST', '/api/reminders', { list, title }),
  setReminderDone: (id: string, done: boolean) => call<{ lists: ReminderList[] }>('PATCH', `/api/reminders/${id}`, { done }),
  renameReminder: (id: string, title: string) => call<{ lists: ReminderList[] }>('PATCH', `/api/reminders/${id}`, { title }),

  settings: () => call<Record<string, unknown>>('GET', '/api/settings'),
  setSetting: (key: string, value: unknown) => call('PUT', `/api/settings/${key}`, { value }),
};
