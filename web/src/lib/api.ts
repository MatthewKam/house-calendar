import type { CalEvent, LeaveAlert, MemberPatch, Reward, Task, Trip, TaskDone, TaskInput, EventInput, Member, ReminderList, SyncedCalendar, SyncStatus, Weather, OutboxStatus, RewardInput, RewardWin, Bucket, StarPlacing, Photo, Daily } from './types';

async function call<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method,
    signal,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    // Signed out (or the PIN changed): the app shows the PIN screen.
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('household:signed-out'));
    const msg = await res.json().then((j) => j.error ?? j.message, () => res.statusText);
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface AuthStatus { pinSet: boolean; masterSet: boolean; signedIn: boolean }
export interface SignedInDevice { id: string; label: string; signedInAt: string; lastSeen: string; thisDevice: boolean }

export const api = {
  authStatus: () => call<AuthStatus>('GET', '/api/auth/status'),
  login: (pin: string) => call<{ signedIn: true }>('POST', '/api/auth/login', { pin }),
  setPin: (body: { pin: string; currentPin?: string; masterPin?: string; signOutOthers?: boolean }) => call<{ pinSet: true }>('POST', '/api/auth/pin', body),
  devices: () => call<SignedInDevice[]>('GET', '/api/auth/devices'),
  signOutDevice: (id: string) => call<void>('POST', `/api/auth/devices/${id}/sign-out`),
  members: () => call<Member[]>('GET', '/api/members'),
  addMember: (m: { name: string; color: string }) => call<Member>('POST', '/api/members', m),
  updateMember: (id: string, m: MemberPatch) => call<Member>('PATCH', `/api/members/${id}`, m),
  removeMember: (id: string) => call<void>('DELETE', `/api/members/${id}`),
  photos: () => call<Photo[]>('GET', '/api/photos'),
  updatePhoto: (id: string, p: { inSlideshow?: boolean; memberId?: string | null }) => call<Photo>('PATCH', `/api/photos/${id}`, p),
  deletePhoto: (id: string) => call<void>('DELETE', `/api/photos/${id}`),
  setSlideshow: (ids: string[], inSlideshow: boolean) => call<{ changed: number }>('POST', '/api/photos/slideshow', { ids, inSlideshow }),
  deletePhotos: (ids: string[]) => call<{ deleted: number }>('POST', '/api/photos/delete', { ids }),

  events: (from: Date, to: Date, fromDay: string, toDay: string) =>
    call<CalEvent[]>('GET', `/api/events?${new URLSearchParams({
      from: from.toISOString(), to: to.toISOString(), fromDay, toDay,
    })}`),
  addEvent: (e: EventInput) => call<CalEvent>('POST', '/api/events', e),
  updateEvent: (id: string, e: Partial<EventInput>) => call<CalEvent>('PATCH', `/api/events/${id}`, e),
  /** Drive time from home and when to leave (Google Maps, on the server). */
  /** Minutes from home to each of today's events still to come that has an address, by event id. */
  travelTimes: () => call<Record<string, number>>('GET', '/api/travel/times'),
  travel: (id: string, signal?: AbortSignal) => call<Trip>('GET', `/api/events/${id}/travel`, undefined, signal),
  weather: () => call<Weather>('GET', '/api/weather'),
  daily: (day: string) => call<Daily>('GET', `/api/daily?${new URLSearchParams({ day })}`),
  alerts: () => call<LeaveAlert[]>('GET', '/api/alerts'),
  addAlert: (eventId: string, minutesBefore: number) => call<LeaveAlert>('POST', '/api/alerts', { eventId, minutesBefore }),
  dismissAlert: (id: string) => call<void>('POST', `/api/alerts/${id}/dismiss`),
  cancelAlert: (id: string) => call<void>('DELETE', `/api/alerts/${id}`),
  removeEvent: (id: string, scope: 'one' | 'all' = 'one') => call<void>('DELETE', `/api/events/${id}${scope === 'all' ? '?scope=all' : ''}`),
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
  buckets: () => call<Bucket[]>('GET', '/api/rewards/buckets'),
  addReward: (r: RewardInput, today: string) => call<Reward>('POST', '/api/rewards', { ...r, today }),
  updateReward: (id: string, r: Partial<RewardInput>, today: string) =>
    call<Reward>('PATCH', `/api/rewards/${id}?${new URLSearchParams({ today })}`, r),
  placeStars: (p: StarPlacing) => call<void>('POST', '/api/rewards/place', p),
  restoreReward: (id: string, deadline: string | null, today: string) => call<Reward>('POST', `/api/rewards/${id}/restore`, { deadline, today }),
  takeBack: (id: string, memberId: string, stars: number, pin: string) =>
    call<void>('POST', `/api/rewards/${id}/take-back`, { memberId, stars, pin }),
  redeem: (winId: string) => call<void>('POST', `/api/rewards/wins/${winId}/given`),
  undoRedeem: (winId: string) => call<void>('POST', `/api/rewards/wins/${winId}/undo`),
  removeReward: (id: string) => call<void>('DELETE', `/api/rewards/${id}`),
  /** Saves a new task order (all task ids, in order). */
  reorderTasks: (ids: string[]) => call<Task[]>('PUT', '/api/tasks/order', { ids }),
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
