export interface Member {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export type MemberPatch = Partial<Pick<Member, 'name' | 'color'>>;

/**
 * A reward jar. Kids put stars from their bucket in it (they can't take them back out); once it's full
 * it's earned, a RewardWin waiting to be redeemed. A jar with a deadline is missed if it isn't
 * redeemed by then, and the kids move their stars back out.
 */
export interface Reward {
  id: string;
  /** Who can fill it: one kid, or several together. */
  memberIds: string[];
  title: string;
  goal: number;
  /** With several kids: their stars added together, or each kid putting in the full amount. */
  teamMode: TeamMode;
  /** Last day to redeem it; none means it empties after it's redeemed and fills again. */
  deadline: string | null;
  /** Stars in it now (everyone's together). */
  stars: number;
  /** Each kid's part of `stars`. */
  memberStars: Record<string, number>;
  /** earned: full, waiting to be redeemed (shown as its win). missed: its deadline passed. */
  status: 'filling' | 'earned' | 'missed';
}
export type TeamMode = 'pooled' | 'each';
export type RewardInput = Pick<Reward, 'memberIds' | 'title' | 'goal' | 'teamMode' | 'deadline'>;

/** One time a jar was filled (then redeemed) or missed, kept even if the jar changes later. */
export interface RewardWin {
  id: string;
  rewardId: string;
  title: string;
  memberIds: string[];
  goal: number;
  stars: number;
  /** Who put in how many. */
  memberStars: Record<string, number>;
  earnedDay: string;
  givenAt: string | null;
  /** Missed: the deadline it didn't make. */
  missedOn: string | null;
}

/** Stars a kid can still put in jars. */
export interface Bucket { memberId: string; stars: number }

/** Stars a kid puts in jars at once; with `from`, taken out of that missed jar first. */
export interface StarPlacing { memberId: string; today: string; from?: string; places: { rewardId: string; stars: number }[] }

export interface CalEvent {
  id: string;
  calendarId: string;
  /** Who it's for, in family order; empty means everyone. */
  memberIds: string[];
  title: string;
  allDay: boolean;
  /** Timed: ISO UTC instant. All-day: YYYY-MM-DD. */
  start: string;
  /** Timed: ISO UTC instant. All-day: YYYY-MM-DD, exclusive. */
  end: string;
  /** synced, or pending_update / pending_delete while a wall edit waits to reach iCloud. */
  syncState: string;
  /** Where it is, on one line; null when there's no address. */
  location: string | null;
  /** One day of a repeating iCloud event: edits here change that day only. */
  repeats: boolean;
}

/** A "time to leave" alert the wall shows at `remindAt`. */
export interface LeaveAlert {
  id: string;
  eventId: string;
  title: string;
  destination: string;
  arriveBy: string;
  minutesBefore: number;
  driveMinutes: number;
  leaveAt: string;
  remindAt: string;
}

/** Drive from home to an event, and when to leave to get there on time. */
export interface Trip {
  minutes: number;
  meters: number;
  /** When to leave; null for all-day events or ones that have started. */
  leaveAt: string | null;
  late: boolean;
  origin: string;
  destination: string;
}

export interface Task {
  id: string;
  title: string;
  /** Who does it; null means everyone, each ticking off their own. */
  memberId: string | null;
  /** Weekdays it's due: 0 = Sunday ... 6 = Saturday. */
  days: number[];
  sortOrder: number;
  /** When it was added (UTC instant); days before that aren't counted as missed. */
  createdAt: string;
  /** Part of the day it's for; null means any time. */
  time: TaskTime | null;
  category: TaskCategory;
  /** Counts toward the day's bar. Otherwise it's an extra worth `points`. */
  required: boolean;
  points: number;
  /** An emoji shown before the title, or null. */
  icon: string | null;
  /** One-time: on the list until it's done or this day ends. Null: it repeats on `days`. */
  dueBy: string | null;
  /** One-time: the day each person did it (it's off their list after that day). */
  doneOn: Record<string, string>;
}

export type TaskTime = 'morning' | 'evening';
/** Shown as Daily, Chores and Bonus ("non_negotiable" is Daily's stored name). */
export type TaskCategory = 'non_negotiable' | 'chores' | 'bonus';

export type TaskInput = Pick<Task, 'title' | 'memberId' | 'days' | 'time' | 'category' | 'required' | 'points' | 'icon' | 'dueBy'>;

/** One check-off: this person did the task on this local day. */
export interface TaskDone { taskId: string; memberId: string; day: string; /** Stars this tick earned (extras only). */ points?: number }

/** A synced (iCloud) calendar and how it shows on the wall. */
export interface SyncedCalendar {
  id: string;
  provider: 'icloud' | 'google';
  name: string;
  /** Its color in Apple Calendar, if any. */
  color: string | null;
  /** Everyone's events in it are this person's; null lets manual picks and Claude decide per event. */
  memberId: string | null;
  hidden: boolean;
  /** Distinct events (a repeating event counts once). */
  events: number;
  /** New events can be added to it from the wall. */
  writable: boolean;
  /** A few upcoming titles, to tell same-named calendars apart. */
  sample: string[];
}

/** A Reminders list as the wall shows it (synced from the family's iPhones by a Shortcut). */
export interface ReminderList {
  title: string;
  items: ReminderItem[];
  /** Phones that last sent this list, newest first. */
  syncedBy: { device: string; at: string }[];
}

export interface ReminderItem {
  /** "p…" came from a phone, "w…" was added on the wall. */
  id: string;
  title: string;
  done: boolean;
  due: string | null;
  /** Changed on the wall and waiting for a phone to apply it in Reminders. */
  pending: boolean;
}

export interface SyncStatus {
  provider: 'icloud' | 'google';
  running: boolean;
  lastSuccess: string | null;
  lastError: string | null;
  calendars: number;
  events: number;
  peopleError: string | null;
  /** Whether iCloud events can be changed on the wall. */
  canWrite: boolean;
}

/** An iCloud event's details, as compared in a conflict. */
export interface EventDetails {
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  location: string | null;
}

/** Wall edits waiting for iCloud, and ones changed on another device too (waiting for a choice). */
export interface OutboxStatus {
  pending: number;
  lastError: string | null;
  /** theirs is null when the event was deleted on the other device. */
  conflicts: { id: number; changed: (keyof EventDetails)[]; mine: EventDetails; theirs: EventDetails | null }[];
}

export type EventInput = Pick<CalEvent, 'title' | 'memberIds' | 'allDay' | 'start' | 'end'> & {
  location?: string | null;
  /** New events only: the iCloud calendar to add it to; left out, it stays on the wall. */
  calendarId?: string;
  /** Changing a repeating iCloud event: just the day opened, or every day. */
  scope?: Scope;
};
export type Scope = 'one' | 'all';

/** Today's weather at home (°F), from GET /api/weather. */
export interface Weather {
  temp: number;
  high: number;
  low: number;
  /** WMO weather code: 0 clear ... 99 thunderstorm. */
  code: number;
  isDay: boolean;
  /** Today's sunrise and sunset (instants). */
  sunrise: string;
  sunset: string;
  /** Today and the next six days. */
  days: { date: string; high: number; low: number; code: number }[];
}

/** A photo in the album. */
export interface Photo {
  id: string;
  width: number;
  height: number;
  /** When it was taken (or the file's date). */
  takenAt: string | null;
  /** Who added it. */
  memberId: string | null;
  source: 'upload' | 'google';
  /** Shown in the screen saver. */
  inSlideshow: boolean;
  createdAt: string;
  url: string;
  thumbUrl: string;
}

/** Screen saver settings (the "screensaver" setting). */
export interface ScreenSaverSettings {
  enabled: boolean;
  /** Minutes without a touch before it starts. */
  idleMinutes: number;
  /** How long each photo stays up. */
  seconds: number;
  /** "mix" changes it every photo. */
  transition: 'mix' | 'fade' | 'kenburns' | 'slide' | 'zoom' | 'blur' | 'flip';
  /** At night (nightFrom to nightTo, "HH:MM"), photos are dimmed and change more slowly. */
  night: boolean;
  nightFrom: string;
  nightTo: string;
}

/** The day's cards beside the weather (null when one couldn't be fetched). */
export interface Daily {
  joke: { text: string } | null;
  quote: { text: string; author: string } | null;
}
