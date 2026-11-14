import type {
	CalEvent,
	EventWeather,
	LeaveAlert,
	MemberPatch,
	Reward,
	Task,
	Trip,
	TaskDone,
	TaskInput,
	TaskPatch,
	EventInput,
	EventPatch,
	ChecklistInput,
	Member,
	ReminderList,
	Reminders,
	SyncedCalendar,
	CalendarPatch,
	Connections,
	SyncStatus,
	Weather,
	OutboxStatus,
	NewReward,
	RewardPatch,
	RewardWin,
	Bucket,
	StarPlacing,
	Photo,
	PhotoPatch,
	Daily,
	Moment,
	NewMoment,
	OwnGoalInput,
	LearnState,
	LearnSound,
	GoalTemplate,
	PottyChart,
	PottyStep,
	Punch,
	Punched,
	Visibility,
	Settings,
	SprigList,
	ListItemPatch,
	NewListItem,
	Proposal,
	LearnDayChange,
	DishIdea,
	SurprisePick,
	MealThemeFields,
	PlanMeal,
	Plans,
	Reminder,
	LearnDone,
	LearnDoneReply,
	LearnSettings,
	Recipe,
	RecipeDraft,
	RecipeFields,
} from './types';

/**
 * A problem worth showing as it is: the server's own reason, or one of the plain ones below. Anything
 * else that goes wrong (a bug) is shown as "Something went wrong" instead of its technical message.
 */
export class SprigError extends Error {}

/** The words for a problem: its own if it's one to show (SprigError), else the fallback. */
export const problemText = (err: unknown, fallback = 'Something went wrong.') =>
	err instanceof SprigError ? err.message : fallback;

/** What the app says when it can't get through, or the server falls over without saying why. */
export const OFFLINE = "Couldn't reach Sprig. Check the connection and try again.";
const SERVER_PROBLEM = "Something went wrong on Sprig's side. Try again in a moment.";

/** A recipe's picture as sent: shrunk to JPEG, as base64. */
export type RecipeImage = { mediaType: 'image/jpeg'; data: string };

async function call<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, {
			method,
			signal,
			headers: body === undefined ? {} : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch (err) {
		// Stopped on purpose (a newer lookup took over): passed on as it is.
		if ((err as Error).name === 'AbortError') throw err;
		throw new SprigError(OFFLINE);
	}
	if (!res.ok) {
		// Signed out (or taken out of the household): the app shows the sign-in screen.
		if (res.status === 401 && !/^\/api\/(auth|account)\//.test(url))
			window.dispatchEvent(new Event('household:signed-out'));
		// The server's own reason when it gave one; otherwise a plain one, not a status code.
		const msg = await res.json().then(
			(j) => j.error ?? j.message,
			() => null,
		);
		throw new SprigError(msg || (res.status >= 500 ? SERVER_PROBLEM : `Something went wrong (${res.status}).`));
	}
	return res.status === 204 ? (undefined as T) : res.json();
}

type Role = 'guardian' | 'kid' | 'wall';
/** Who this device is signed in as (server/hosted.ts). */
export type AuthStatus =
	| { signedIn: false }
	| {
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
			/** When this device signed in (or joined, for a kid's device or the wall). */
			signedInAt: string;
			/** A guardian's own device acting as the wall (Settings turns it on; a guardian's PIN turns it off). */
			wallMode: boolean;
			/** The wall: a guardian's PIN has been typed. */
			entered: boolean;
			/** May change parent-only things now; always, on a guardian's own device. */
			parent: boolean;
			parentAlways: boolean;
			/** This is the account holder (or a device they unlocked): approves color changes; the wall wears their accent. */
			holder: boolean;
			holderName: string | null;
			/** This guardian has set their PIN; how many guardians have. */
			hasPin: boolean;
			guardianPins: number;
			/** Every guardian's PIN has this many digits (null: they differ, or aren't known). */
			pinLength: number | null;
	  };
export type SignedIn = Extract<AuthStatus, { signedIn: true }>;
interface AccountConfig {
	google: string | null;
	apple: string | null;
	email: boolean;
}
export interface JoinPreview {
	kind: 'guardian' | 'kid' | 'wall';
	household: string;
	for: string | null;
	choose: { id: string; name: string }[] | null;
}
export interface HouseholdAccess {
	name: string;
	people: {
		memberId: string;
		name: string;
		color: string;
		membershipId: string | null;
		role: 'guardian' | 'kid' | null;
		holder: boolean;
		email: string | null;
		account: boolean;
		hasPin: boolean;
	}[];
	invites: { id: string; kind: 'guardian' | 'kid' | 'wall'; for: string | null; expiresAt: string }[];
	devices: {
		id: string;
		label: string;
		kind: 'user' | 'device' | 'wall';
		who: string | null;
		signedInAt: string;
		lastSeen: string;
		thisDevice: boolean;
		locked: boolean;
	}[];
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
	/** Sets this guardian's PIN; changing one takes the current PIN. */
	setMyPin: (pin: string, current?: string) =>
		call<AuthStatus>('PUT', '/api/account/pin', current ? { pin, current } : { pin }),
	/** Forgot it: a code to this guardian's email (or the server's log). */
	forgotPin: () => call<{ sentTo: string }>('POST', '/api/account/pin/forgot'),
	resetPin: (code: string, pin: string) => call<AuthStatus>('POST', '/api/account/pin/reset', { code, pin }),
	/** The account holder clears another guardian's PIN. */
	/** Lets a device locked by wrong PINs try again now. */
	unlockDevice: (id: string) => call<void>('POST', `/api/account/devices/${id}/unlock`),
	clearPin: (membershipId: string) => call<void>('DELETE', `/api/account/memberships/${membershipId}/pin`),
	enterWall: (pin: string) => call<AuthStatus>('POST', '/api/auth/enter', { pin }),
	lockWall: () => call<AuthStatus>('POST', '/api/auth/lock-wall'),
	/** Wall mode on this guardian's device, or off again (unlocked with a guardian's PIN first). */
	setWallMode: (on: boolean) => call<AuthStatus>('POST', '/api/auth/wall-mode', { on }),
	unlockParent: (pin: string) => call<AuthStatus>('POST', '/api/auth/parent', { pin }),
	lockParent: () => call<AuthStatus>('POST', '/api/auth/parent/lock'),
	checkPin: (pin: string) => call<void>('POST', '/api/auth/check-pin', { pin }),
	signOutDevice: (id: string) => call<void>('POST', `/api/auth/devices/${id}/sign-out`),
	/** People's calendar connections; google is null when the server hasn't set Google up. */
	connections: () => call<Connections>('GET', '/api/connections'),
	connectICloud: (c: { appleId: string; password: string }) => call<void>('POST', '/api/connections/icloud', c),
	removeConnection: (id: string) => call<void>('DELETE', `/api/connections/${id}`),
	members: () => call<Member[]>('GET', '/api/members'),
	updateMember: (id: string, m: MemberPatch) => call<Member>('PATCH', `/api/members/${id}`, m),
	/** A new color for someone: made at once by the account holder, otherwise asked for (asked: true). */
	setMemberColor: (id: string, color: string) =>
		call<{ member: Member; asked: boolean }>('PUT', `/api/members/${id}/color`, { color }),
	answerColor: (id: string, approve: boolean) => call<Member>('POST', `/api/members/${id}/color/answer`, { approve }),
	/** Hands the account holder's role to another guardian. */
	setHolder: (membershipId: string) => call<AuthStatus>('POST', '/api/account/holder', { membershipId }),
	learn: (today: string) => call<LearnState[]>('GET', `/api/learn?today=${today}`),
	setLearn: (memberId: string, today: string, p: Omit<LearnSettings, 'today'>) =>
		call<LearnState>('PUT', `/api/learn/${memberId}`, { ...p, today }),
	learnDone: (memberId: string, p: LearnDone) => call<LearnDoneReply>('POST', `/api/learn/${memberId}/done`, p),
	/** A grown-up unlocking or locking a kid's Learn today, or giving more games or minutes (parent-only). */
	changeLearnDay: (memberId: string, today: string, change: LearnDayChange) =>
		call<LearnState>('POST', `/api/learn/${memberId}/today`, { ...change, today }),
	/** Time spent in a game, for a time limit. */
	learnTime: (memberId: string, today: string, seconds: number) =>
		call<LearnState>('POST', `/api/learn/${memberId}/time`, { today, seconds }),
	/** Animal noises a grown-up recorded, and when (for each one's address, so a new one isn't cached). */
	learnSounds: () => call<LearnSound[]>('GET', '/api/learn/sounds'),
	recordLearnSound: async (animal: string, audio: Blob) => {
		const res = await fetch(`/api/learn/sounds/${animal}`, {
			method: 'PUT',
			headers: { 'content-type': audio.type || 'audio/webm' },
			body: audio,
		});
		if (!res.ok)
			throw new SprigError(
				await res.json().then(
					(j) => j.error ?? j.message,
					() => res.statusText,
				),
			);
		return (await res.json()) as LearnSound;
	},
	deleteLearnSound: (animal: string) => call<void>('DELETE', `/api/learn/sounds/${animal}`),
	/** Recipes (server/recipes.ts): whether reading works here, the book, reading a draft, keeping one. */
	recipeReading: () => call<{ on: boolean; pictures: boolean }>('GET', '/api/recipes/reading'),
	recipes: () => call<Recipe[]>('GET', '/api/recipes'),
	/** Dishes to try (Claude): for the time, a kind, anything else; never one already shown. */
	dishIdeas: (ask: { time: string | null; kind: string | null; ask: string | null; seen: string[] }) =>
		call<{ ideas: DishIdea[] }>('POST', '/api/recipes/ideas', ask),
	/** Surprise me (Claude): one dish for the weather (in words), from the book or new; never one already picked. */
	surprise: (ask: {
		time: string | null;
		kind: string | null;
		ask: string | null;
		weather: string | null;
		seen: string[];
	}) => call<{ pick: SurprisePick }>('POST', '/api/recipes/surprise', ask),
	readRecipe: (from: { images: RecipeImage[] } | { url: string }) =>
		call<RecipeDraft>('POST', '/api/recipes/read', from),
	addRecipe: (recipe: RecipeFields, images: RecipeImage[], cover: number | null) =>
		call<Recipe>('POST', '/api/recipes', { recipe, images, cover }),
	updateRecipe: (id: string, recipe: RecipeFields) => call<Recipe>('PUT', `/api/recipes/${id}`, recipe),
	deleteRecipe: (id: string) => call<void>('DELETE', `/api/recipes/${id}`),
	/** More photos: of the dish (step null), or of a step (its place, from 0). */
	addRecipeImages: (id: string, images: RecipeImage[], step: number | null) =>
		call<Recipe>('POST', `/api/recipes/${id}/images`, { images, step }),
	/** The main photo, or none (null: a default picture shows). */
	setRecipeCover: (id: string, imageId: string | null) => call<Recipe>('PUT', `/api/recipes/${id}/cover`, { imageId }),
	deleteRecipeImage: (id: string, imageId: string) => call<Recipe>('DELETE', `/api/recipes/${id}/images/${imageId}`),
	/** A time it was cooked (minutes), and someone's rating out of 5 (null takes it back). */
	logRecipeCook: (id: string, minutes: number, note: string | null) =>
		call<Recipe>('POST', `/api/recipes/${id}/cooks`, { minutes, note }),
	/** The family's tags; notes after cooking. */
	setRecipeTags: (id: string, tags: string[]) => call<Recipe>('PUT', `/api/recipes/${id}/tags`, { tags }),
	addRecipeNote: (id: string, text: string) => call<Recipe>('POST', `/api/recipes/${id}/notes`, { text }),
	editRecipeNote: (id: string, noteId: string, text: string) =>
		call<Recipe>('PUT', `/api/recipes/${id}/notes/${noteId}`, { text }),
	deleteRecipeNote: (id: string, noteId: string) => call<Recipe>('DELETE', `/api/recipes/${id}/notes/${noteId}`),
	rateRecipe: (id: string, memberId: string, stars: number | null) =>
		call<Recipe>('PUT', `/api/recipes/${id}/ratings/${memberId}`, { stars }),
	/** Plan ahead (server/meals.ts): recipes on days (their prep reminders on To do), and themed days. */
	meals: () => call<Plans>('GET', '/api/meals'),
	planMeal: (plan: { day: string; meal: PlanMeal; recipeId: string; timeZone: string; reminders: Reminder[] }) =>
		call<Plans>('POST', '/api/meals', plan),
	moveMeal: (id: string, to: { day: string; meal: PlanMeal; timeZone: string; reminders: Reminder[] }) =>
		call<Plans>('PUT', `/api/meals/${id}`, to),
	unplanMeal: (id: string) => call<Plans>('DELETE', `/api/meals/${id}`),
	addMealTheme: (theme: MealThemeFields) => call<Plans>('POST', '/api/meal-themes', theme),
	editMealTheme: (id: string, theme: MealThemeFields) => call<Plans>('PUT', `/api/meal-themes/${id}`, theme),
	deleteMealTheme: (id: string) => call<Plans>('DELETE', `/api/meal-themes/${id}`),
	photos: () => call<Photo[]>('GET', '/api/photos'),
	updatePhoto: (id: string, p: PhotoPatch) => call<Photo>('PATCH', `/api/photos/${id}`, p),
	deletePhoto: (id: string) => call<void>('DELETE', `/api/photos/${id}`),
	setSlideshow: (ids: string[], inSlideshow: boolean) =>
		call<{ changed: number }>('POST', '/api/photos/slideshow', { ids, inSlideshow }),
	deletePhotos: (ids: string[]) => call<{ deleted: number }>('POST', '/api/photos/delete', { ids }),

	events: (from: Date, to: Date, fromDay: string, toDay: string) =>
		call<CalEvent[]>(
			'GET',
			`/api/events?${new URLSearchParams({
				from: from.toISOString(),
				to: to.toISOString(),
				fromDay,
				toDay,
			})}`,
		),
	addEvent: (e: EventInput) => call<CalEvent>('POST', '/api/events', e),
	updateEvent: (id: string, e: EventPatch) => call<CalEvent>('PATCH', `/api/events/${id}`, e),
	/** Drive time from home and when to leave (Google Maps, on the server). */
	/** Minutes from home to each of today's events still to come that has an address, by event id. */
	/** Address suggestions for what's typed so far (Google Places, on the server); none without a key. */
	places: (q: string, session: string, signal?: AbortSignal) =>
		call<{ text: string; main: string; secondary: string }[]>(
			'GET',
			`/api/places?${new URLSearchParams({ q, session })}`,
			undefined,
			signal,
		),
	travelTimes: () => call<Record<string, number>>('GET', '/api/travel/times'),
	travel: (id: string, signal?: AbortSignal) => call<Trip>('GET', `/api/events/${id}/travel`, undefined, signal),
	/** At home, or (here) where this device is. */
	weather: (here?: { lat: number; lon: number } | null) =>
		call<Weather>('GET', here ? `/api/weather?lat=${here.lat}&lon=${here.lon}` : '/api/weather'),
	/** Where a place typed in is, for its weather. */
	weatherPlace: (q: string) =>
		call<{ lat: number; lon: number }>('GET', `/api/weather/place?${new URLSearchParams({ q })}`),
	/** Forecasts for the far-away ones of these events, by id. */
	eventWeather: (ids: string[]) =>
		call<Record<string, EventWeather>>('GET', `/api/weather/events?ids=${ids.join(',')}`),
	daily: (day: string) => call<Daily>('GET', `/api/daily?${new URLSearchParams({ day })}`),
	alerts: () => call<LeaveAlert[]>('GET', '/api/alerts'),
	addAlert: (eventId: string, minutesBefore: number) =>
		call<LeaveAlert>('POST', '/api/alerts', { eventId, minutesBefore }),
	dismissAlert: (id: string) => call<void>('POST', `/api/alerts/${id}/dismiss`),
	cancelAlert: (id: string) => call<void>('DELETE', `/api/alerts/${id}`),
	removeEvent: (id: string, scope: 'one' | 'all' = 'one') =>
		call<void>('DELETE', `/api/events/${id}${scope === 'all' ? '?scope=all' : ''}`),
	restoreEvent: (id: string) => call<CalEvent>('POST', `/api/events/${id}/restore`),
	outbox: () => call<OutboxStatus>('GET', '/api/outbox'),
	resolveConflict: (id: number, keep: 'mine' | 'theirs') =>
		call<OutboxStatus>('POST', `/api/outbox/${id}/resolve`, { keep }),
	/** Who a synced event is for; covers every repeat of it. */
	setPeople: (id: string, memberIds: string[]) => call<CalEvent>('PUT', `/api/events/${id}/people`, { memberIds }),
	setVisibility: (id: string, visibility: Visibility | null) =>
		call<CalEvent>('PUT', `/api/events/${id}/visibility`, { visibility }),
	setSpecial: (id: string, special: boolean) => call<CalEvent>('PUT', `/api/events/${id}/special`, { special }),
	/** What to bring, in order (every repeat of it); items with an id keep their ticks. */
	setChecklist: (id: string, items: ChecklistInput['items']) =>
		call<CalEvent>('PUT', `/api/events/${id}/checklist`, { items }),
	tickChecklist: (id: string, itemId: string, done: boolean) =>
		call<CalEvent>('PUT', `/api/events/${id}/checklist/${itemId}`, { done }),

	sync: () => call<SyncStatus | null>('GET', '/api/sync'),
	calendars: () => call<SyncedCalendar[]>('GET', '/api/calendars'),
	updateCalendar: (id: string, patch: CalendarPatch) => call<SyncedCalendar>('PATCH', `/api/calendars/${id}`, patch),

	tasks: () => call<Task[]>('GET', '/api/tasks'),
	addTask: (c: TaskInput) => call<Task>('POST', '/api/tasks', c),
	updateTask: (id: string, c: TaskPatch) => call<Task>('PATCH', `/api/tasks/${id}`, c),
	removeTask: (id: string) => call<void>('DELETE', `/api/tasks/${id}`),
	rewards: (today: string) => call<Reward[]>('GET', `/api/rewards?${new URLSearchParams({ today })}`),
	rewardHistory: () => call<RewardWin[]>('GET', '/api/rewards/history'),
	buckets: () => call<Bucket[]>('GET', '/api/rewards/buckets'),
	moments: (from: string, to: string) => call<Moment[]>('GET', `/api/moments?${new URLSearchParams({ from, to })}`),
	addMoment: (m: NewMoment) => call<Moment>('POST', '/api/moments', m),
	removeMoment: (id: string) => call<void>('DELETE', `/api/moments/${id}`),
	potty: () => call<PottyChart[]>('GET', '/api/potty'),
	setPotty: (memberId: string, on: boolean) => call<void>('PUT', `/api/potty/${memberId}`, { on }),
	punch: ({ memberId, step, kind }: { memberId: string } & Punch) =>
		call<Punched>('POST', `/api/potty/${memberId}`, {
			step,
			...(kind ? { kind } : {}),
		}),
	takeBackPunch: ({ memberId, step }: { memberId: string; step: PottyStep }) =>
		call<void>('DELETE', `/api/potty/${memberId}/${step}`),
	goalLibrary: () => call<GoalTemplate[]>('GET', '/api/goals/library'),
	hideGoal: ({ key, hidden }: { key: string; hidden: boolean }) =>
		call<void>('PUT', `/api/goals/library/${encodeURIComponent(key)}`, { hidden }),
	hideAllGoals: (hidden: boolean) => call<void>('PUT', '/api/goals/library', { hidden }),
	saveOwnGoal: (g: OwnGoalInput) => call<GoalTemplate>('POST', '/api/goals/library', g),
	addReward: (r: NewReward, today: string) => call<Reward>('POST', '/api/rewards', { ...r, today }),
	updateReward: (id: string, r: RewardPatch, today: string) =>
		call<Reward>('PATCH', `/api/rewards/${id}?${new URLSearchParams({ today })}`, r),
	placeStars: (p: StarPlacing) => call<void>('POST', '/api/rewards/place', p),
	restoreReward: (id: string, deadline: string | null, today: string) =>
		call<Reward>('POST', `/api/rewards/${id}/restore`, { deadline, today }),
	takeBack: (id: string, memberId: string, stars: number) =>
		call<void>('POST', `/api/rewards/${id}/take-back`, { memberId, stars }),
	redeem: (winId: string) => call<void>('POST', `/api/rewards/wins/${winId}/given`),
	undoRedeem: (winId: string) => call<void>('POST', `/api/rewards/wins/${winId}/undo`),
	removeReward: (id: string) => call<void>('DELETE', `/api/rewards/${id}`),
	/** Saves a new task order (all task ids, in order). */
	reorderTasks: (ids: string[]) => call<Task[]>('PUT', '/api/tasks/order', { ids }),
	tasksDone: (from: string, to: string) =>
		call<TaskDone[]>('GET', `/api/tasks/done?${new URLSearchParams({ from, to })}`),
	setTaskDone: (id: string, memberId: string, day: string, done: boolean) =>
		call<void>(done ? 'PUT' : 'DELETE', `/api/tasks/${id}/done/${memberId}/${day}`),

	reminders: () => call<Reminders>('GET', '/api/reminders'),
	addReminder: (list: string, title: string) =>
		call<{ lists: ReminderList[] }>('POST', '/api/reminders', { list, title }),
	setReminderDone: (id: string, done: boolean) =>
		call<{ lists: ReminderList[] }>('PATCH', `/api/reminders/${id}`, { done }),
	renameReminder: (id: string, title: string) =>
		call<{ lists: ReminderList[] }>('PATCH', `/api/reminders/${id}`, { title }),
	lists: () => call<SprigList[]>('GET', '/api/lists'),
	addList: (title: string) => call<SprigList[]>('POST', '/api/lists', { title }),
	renameList: (id: string, title: string) => call<SprigList[]>('PATCH', `/api/lists/${id}`, { title }),
	deleteList: (id: string) => call<SprigList[]>('DELETE', `/api/lists/${id}`),
	clearDone: (id: string) => call<SprigList[]>('DELETE', `/api/lists/${id}/done`),
	addListItem: (listId: string, item: NewListItem) => call<SprigList[]>('POST', `/api/lists/${listId}/items`, item),
	updateListItem: (id: string, patch: ListItemPatch) => call<SprigList[]>('PATCH', `/api/lists/items/${id}`, patch),
	deleteListItem: (id: string) => call<SprigList[]>('DELETE', `/api/lists/items/${id}`),

	captureOn: () => call<{ on: boolean }>('GET', '/api/capture'),
	capture: (input: { text: string } | { image: { mediaType: string; data: string } }) =>
		call<{ proposals: Proposal[] }>('POST', '/api/capture', {
			...input,
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		}),
	pushKey: () => call<{ publicKey: string }>('GET', '/api/push/key'),
	pushOn: (subscription: PushSubscriptionJSON, timeZone: string) =>
		call<void>('POST', '/api/push', { subscription, timeZone }),
	pushOff: (endpoint: string) => call<void>('DELETE', '/api/push', { endpoint }),

	settings: () => call<Settings>('GET', '/api/settings'),
	setSetting: (key: string, value: unknown) => call<Settings>('PUT', `/api/settings/${key}`, { value }),
};
