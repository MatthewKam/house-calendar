import type { Stage } from '../../../shared/stages.ts';
import type { Visibility } from '../../../shared/calendars.ts';

// Stages, moments and the goal list: written once in shared/, for the server and here.
export type { Stage } from '../../../shared/stages.ts';
export type { Activity as MomentKind, GoalTemplate, Moment, NewMoment, OwnGoalInput } from '../../../shared/moments.ts';

// Potty charts: written once in shared/potty.ts, for the server and here.
export type { PottyChart, PottyKind, PottyStep, Punch, Punched } from '../../../shared/potty.ts';

// Kept here rather than taken from shared/members.ts on purpose (audit S5): the web app's edit is narrower
// than what the server takes (no sortOrder; a colour goes through setMemberColor when signed in).
export interface Member {
	id: string;
	name: string;
	color: string;
	sortOrder: number;
	/** YYYY-MM-DD, when it's been set. */
	birthdate: string | null;
	/** The stage in effect: the one a guardian chose, else from the birthdate; null with neither. */
	stage: Stage | null;
	/** The stage a guardian chose; null when it comes from the birthdate. */
	stageChosen: Stage | null;
	/** A guardian (known only when signed in): only they change their own color. */
	guardian: boolean;
	/** A new color waiting for the account holder to approve, and who asked (server/members.ts). */
	colorAsked: { color: string; by: string | null } | null;
	/** What they're allergic to: "peanuts", "milk", or their own words (recipes flag it; lib/allergies.ts). */
	allergies: string[];
}

export type MemberPatch = Partial<Pick<Member, 'name' | 'color' | 'birthdate' | 'allergies'>> & {
	stage?: Stage | null;
};

// Reward jars: written once in shared/rewards.ts, for the server and here.
export type {
	Bucket,
	NewReward,
	Reward,
	RewardPatch,
	RewardWin,
	StarPlacing,
	TeamMode,
} from '../../../shared/rewards.ts';

/** One thing to bring to an event; `done`: ticked for this time it happens. */
export interface ChecklistItem {
	id: string;
	title: string;
	/** An emoji, shown to the kids instead of the words. */
	picture: string | null;
	done: boolean;
}

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
	/** Who sees it: its own setting, else its calendar's (server/privacy.ts). */
	visibility: Visibility;
	/** Marked special: a countdown on kid mode's Today, for the kids it's for (every repeat of it). */
	special: boolean;
	/** Sprig's own events: notes, and the flyer photo it was read from (Snap a flyer). */
	notes: string | null;
	photoUrl: string | null;
	/** What to bring (every repeat of it), ticked for this time it happens. */
	checklist: ChecklistItem[];
	/** Someone else's Busy time: no title or place, and it can't be opened. */
	busy?: boolean;
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

// Tasks, goals and check-offs: written once in shared/tasks.ts, for the server and here.
export type { Task, TaskCategory, TaskDone, TaskInput, TaskPatch, TaskTime } from '../../../shared/tasks.ts';

// Calendars, sync status and calendar accounts: written once in shared/calendars.ts, for the server and here.
export type {
	CalendarPatch,
	Connection,
	Connections,
	SyncedCalendar,
	SyncStatus,
	Visibility,
} from '../../../shared/calendars.ts';

// Lists kept in Sprig itself: written once in shared/lists.ts, for the server and here.
export type { ListItemPatch, NewListItem, SprigItem, SprigList } from '../../../shared/lists.ts';

/** A Reminders list as the wall shows it (synced from the family's iPhones by a Shortcut). */
export interface ReminderList {
	title: string;
	items: ReminderItem[];
	/** Phones that last sent this list, newest first. */
	syncedBy: { device: string; at: string }[];
}

interface ReminderItem {
	/** "p…" came from a phone, "w…" was added on the wall. */
	id: string;
	title: string;
	done: boolean;
	due: string | null;
	/** Changed on the wall and waiting for a phone to apply it in Reminders. */
	pending: boolean;
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
	/** Kept on Sprig's own events only. */
	notes?: string | null;
	/** A flyer photo (uploadFlyer) to keep with it; null takes it off. */
	photoId?: string | null;
	/** New events only: the iCloud calendar to add it to; left out, it stays on the wall. */
	calendarId?: string;
	/** New events only: who sees it (existing ones change it with setVisibility). */
	visibility?: Visibility;
	/** New events only: a countdown on kid mode's Today (existing ones change it with setSpecial). */
	special?: boolean;
	/** Changing a repeating iCloud event: just the day opened, or every day. */
	scope?: Scope;
};
export type Scope = 'one' | 'all';

/** Today's weather at home (the server's own shape, shared). */
export type { EventWeather, Wear, Weather } from '../../../shared/weather.ts';
// Recipes: written once in shared/recipes.ts, for the server and here.
export type {
	CookNote,
	DishIdea,
	Ingredient,
	Meal,
	Recipe,
	RecipeDraft,
	RecipeFields,
	SurprisePick,
} from '../../../shared/recipes.ts';

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
	/** A video plays muted, its length at most 45 seconds. */
	kind: 'photo' | 'video';
	/** A video's length. */
	seconds: number | null;
	/** False while a new video is being converted on the server. */
	ready: boolean;
	/** While converting: how far along, 0 to 1 (0 while it waits its turn). */
	progress: number | null;
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
	/** Today's events, listed in the bottom-left corner. */
	showEvents: boolean;
}

/** The day's cards beside the weather (null when one couldn't be fetched). */
export interface Daily {
	joke: { text: string } | null;
	quote: { text: string; author: string } | null;
}

/** Something Say it or Snap a flyer found, shown as a card to check (server/capture.ts). */
export type Proposal =
	| { kind: 'item'; title: string; list: string; due: string | null; memberId: string | null }
	| {
			kind: 'event';
			title: string;
			allDay: boolean;
			start: string;
			end: string;
			memberIds: string[];
			location: string | null;
			notes: string | null;
	  }
	| { kind: 'task'; title: string; memberId: string; day: string };

/** Learning's games (server/learn.ts): Little's four, then Early's. */
import type { Game } from '../../../shared/learn.ts';
export type { Game };

// Learning's requests and replies: written once in shared/learnShapes.ts, for the server and here.
export type {
	LearnDayChange,
	LearnDone,
	LearnDoneReply,
	LearnSettings,
	LearnSound,
	LearnState,
	LearnToday,
} from '../../../shared/learnShapes.ts';

// Plan ahead: written once in shared/meals.ts.
export type { MealPlan, MealTheme, MealThemeFields, PlanMeal, Plans, Reminder } from '../../../shared/meals.ts';
