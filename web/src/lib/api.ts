import type { CalEvent, LeaveAlert, MemberPatch, Reward, Task, Trip, TaskDone, TaskInput, EventInput, Member, ReminderList, SyncedCalendar, SyncStatus, Weather, OutboxStatus, RewardInput, RewardWin, Bucket, StarPlacing, Photo, Daily, Moment, MomentKind, GoalTemplate, PottyChart, PottyStep } from './types';

async function call<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method,
    signal,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    // Signed out (or taken out of the household): the app shows the sign-in screen.
    if (res.status === 401 && !/^\/api\/(auth|account)\//.test(url)) window.dispatchEvent(new Event('household:signed-out'));
    const msg = await res.json().then((j) => j.error ?? j.message, () => res.statusText);
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type Role = 'guardian' | 'kid' | 'wall';
/** Who this device is signed in as (server/hosted.ts). */
export type AuthStatus = { signedIn: false } | {
  signedIn: true;
  /** Someone's account, a kid's device added by code, or the wall. */
  kind: 'user' | 'device' | 'wall';
  user: { name: string; email: string | null } | null;
  household: { id: string; name: string } | null;
  households: { id: string; name: string; role: Role }[];
  role: Role | null;
  memberId: string | null;
  /** The person signed in on this device (not the wall). */
  me: { name: string; color: string } | null;
  /** The guardian whose PIN unlocked this wall or kid's device. */
  unlockedBy: string | null;
  /** The wall: a guardian's PIN has been typed. */
  entered: boolean;
  /** May change parent-only things now; always, on a guardian's own device. */
  parent: boolean; parentAlways: boolean;
  /** This guardian has set their PIN; how many guardians have. */
  hasPin: boolean; guardianPins: number;
};
export type SignedIn = Extract<AuthStatus, { signedIn: true }>;
export interface GoogleConnection {
  id: string; account: string; memberId: string | null; connectedAt: string;
  lastSuccess: string | null; lastError: string | null; calendars: number;
}
export interface AccountConfig { google: string | null; apple: string | null; email: boolean }
export interface JoinPreview { kind: 'guardian' | 'kid' | 'wall'; household: string; for: string | null; choose: { id: string; name: string }[] | null }
export interface HouseholdAccess {
  name: string;
  people: { memberId: string; name: string; color: string; membershipId: string | null; role: 'guardian' | 'kid' | null; email: string | null; account: boolean; hasPin: boolean }[];
  invites: { id: string; kind: 'guardian' | 'kid' | 'wall'; for: string | null; expiresAt: string }[];
  devices: { id: string; label: string; kind: 'user' | 'device' | 'wall'; who: string | null; signedInAt: string; lastSeen: string; thisDevice: boolean }[];
}

export const api = {
  authStatus: () => call<AuthStatus>('GET', '/api/auth/status'),
  accountConfig: () => call<AccountConfig>('GET', '/api/account/config'),
  signInWith: (provider: 'google' | 'apple', idToken: string, name?: string) =>
    call<AuthStatus>('POST', `/api/account/signin/${provider}`, { idToken, ...(name ? { name } : {}) }),
  emailCode: (email: string) => call<{ sent: true }>('POST', '/api/account/email/start', { email }),
  verifyEmail: (email: string, code: string) => call<AuthStatus>('POST', '/api/account/email/verify', { email, code }),
  signOut: () => call<void>('POST', '/api/account/signout'),
  createHousehold: (b: { name: string; yourName: string }) => call<AuthStatus>('POST', '/api/account/households', b),
  useHousehold: (id: string) => call<AuthStatus>('POST', `/api/account/households/${id}/use`),
  previewJoin: (code: string) => call<JoinPreview>('GET', `/api/account/join/${encodeURIComponent(code)}`),
  join: (b: { code: string; memberId?: string; name?: string }) => call<AuthStatus>('POST', '/api/account/join', b),
  household: () => call<HouseholdAccess>('GET', '/api/account/household'),
  invite: (b: { kind: 'guardian' | 'kid' | 'wall'; memberId?: string; name?: string }) =>
    call<{ code: string; expiresAt: string }>('POST', '/api/account/invites', b),
  cancelInvite: (id: string) => call<void>('DELETE', `/api/account/invites/${id}`),
  removeSignIn: (membershipId: string) => call<void>('DELETE', `/api/account/memberships/${membershipId}`),
  setMyPin: (pin: string) => call<AuthStatus>('PUT', '/api/account/pin', { pin }),
  enterWall: (pin: string) => call<AuthStatus>('POST', '/api/auth/enter', { pin }),
  lockWall: () => call<AuthStatus>('POST', '/api/auth/lock-wall'),
  unlockParent: (pin: string) => call<AuthStatus>('POST', '/api/auth/parent', { pin }),
  lockParent: () => call<AuthStatus>('POST', '/api/auth/parent/lock'),
  checkPin: (pin: string) => call<void>('POST', '/api/auth/check-pin', { pin }),
  signOutDevice: (id: string) => call<void>('POST', `/api/auth/devices/${id}/sign-out`),
  /** People's calendar connections; google is null when the server hasn't set Google up. */
  connections: () => call<{ google: GoogleConnection[] | null; icloud: GoogleConnection[] | null }>('GET', '/api/connections'),
  connectICloud: (c: { appleId: string; password: string }) => call<void>('POST', '/api/connections/icloud', c),
  removeConnection: (id: string) => call<void>('DELETE', `/api/connections/${id}`),
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
  /** Address suggestions for what's typed so far (Google Places, on the server); none without a key. */
  places: (q: string, session: string, signal?: AbortSignal) =>
    call<{ text: string; main: string; secondary: string }[]>('GET', `/api/places?${new URLSearchParams({ q, session })}`, undefined, signal),
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
  moments: (from: string, to: string) => call<Moment[]>('GET', `/api/moments?${new URLSearchParams({ from, to })}`),
  addMoment: (m: { memberId: string; kind: MomentKind; note?: string; day: string; stars: number }) => call<Moment>('POST', '/api/moments', m),
  removeMoment: (id: string) => call<void>('DELETE', `/api/moments/${id}`),
  potty: () => call<PottyChart[]>('GET', '/api/potty'),
  setPotty: (memberId: string, on: boolean) => call<void>('PUT', `/api/potty/${memberId}`, { on }),
  punch: ({ memberId, step, kind }: { memberId: string; step: PottyStep; kind?: 'pee' | 'poo' }) =>
    call<{ rowFull: boolean; cardFull: boolean; chart: PottyChart }>('POST', `/api/potty/${memberId}`, { step, ...(kind ? { kind } : {}) }),
  takeBackPunch: ({ memberId, step }: { memberId: string; step: PottyStep }) => call<void>('DELETE', `/api/potty/${memberId}/${step}`),
  goalLibrary: () => call<GoalTemplate[]>('GET', '/api/goals/library'),
  hideGoal: ({ key, hidden }: { key: string; hidden: boolean }) => call<void>('PUT', `/api/goals/library/${encodeURIComponent(key)}`, { hidden }),
  hideAllGoals: (hidden: boolean) => call<void>('PUT', '/api/goals/library', { hidden }),
  saveOwnGoal: (g: { title: string; emoji: string; kind: MomentKind }) => call<GoalTemplate>('POST', '/api/goals/library', g),
  addReward: (r: RewardInput, today: string) => call<Reward>('POST', '/api/rewards', { ...r, today }),
  updateReward: (id: string, r: Partial<RewardInput>, today: string) =>
    call<Reward>('PATCH', `/api/rewards/${id}?${new URLSearchParams({ today })}`, r),
  placeStars: (p: StarPlacing) => call<void>('POST', '/api/rewards/place', p),
  restoreReward: (id: string, deadline: string | null, today: string) => call<Reward>('POST', `/api/rewards/${id}/restore`, { deadline, today }),
  takeBack: (id: string, memberId: string, stars: number) =>
    call<void>('POST', `/api/rewards/${id}/take-back`, { memberId, stars }),
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
