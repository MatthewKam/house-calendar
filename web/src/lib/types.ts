import type { Stage } from '../../../shared/stages.ts';
import type { EventPatch, NewEvent } from '../../../shared/events.ts';

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

// Events, what to bring and wall edits waiting for iCloud: written once in shared/events.ts, for the
// server and here.
export type {
	CalEvent,
	ChecklistInput,
	ChecklistItem,
	EventDetails,
	EventPatch,
	OutboxStatus,
	Scope,
} from '../../../shared/events.ts';
/** What the event form saves: a new event as sent (what's left out is filled in), or with `scope`, an edit. */
export type EventInput = NewEvent & Pick<EventPatch, 'scope'>;

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

// Alerts on grown-ups' phones: written once in shared/push.ts.
export type { PushKey } from '../../../shared/push.ts';

// Reminders from the family's iPhones: written once in shared/reminders.ts, for the server and here.
export type { ReminderList, ReminderPatch, Reminders } from '../../../shared/reminders.ts';

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

// The photo album: written once in shared/photos.ts, for the server and here.
export type { Photo, PhotoPatch } from '../../../shared/photos.ts';

// Display settings, a value for each key: written once in shared/settings.ts, for the server and here.
export type { Settings } from '../../../shared/settings.ts';

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
