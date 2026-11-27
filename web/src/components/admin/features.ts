// The usage log's routes (server/usage.ts) in plain words, for the admin page: grouped by what part of Sprig
// they're in (the part of the address after /api/). Some are Sprig itself, not a person: those are marked
// automatic and kept apart.

const AREAS: Record<string, string> = {
	tasks: 'Tasks',
	rewards: 'Rewards and jars',
	events: 'Calendar events',
	lists: 'Lists and shopping',
	recipes: 'Recipes',
	'recipe-shopping': 'Recipe shopping',
	meals: 'Meal plan',
	'meal-themes': 'Meal themes',
	'dish-ideas': 'Dish ideas',
	cook: 'Cooking together',
	moments: 'Moments',
	potty: 'Potty charts',
	goals: 'Goals',
	learn: 'Learn',
	photos: 'Photos',
	members: 'Family',
	settings: 'Settings',
	capture: 'Snap and Say it',
	'day-plans': 'Day plans',
	'special-reminders': 'Special-day reminders',
	checklists: 'Checklists',
	calendars: 'Calendars',
	connections: 'Calendar connections',
	reminders: 'Reminders',
	places: 'Places',
	travel: 'Travel times',
	weather: 'Weather',
	alerts: 'Leave-time alerts',
	daily: 'Daily cards',
};

/** Sprig doing it by itself (a phone sending its calendars, a sync on opening, alerts set up), not a person. */
const AUTOMATIC = new Set(['phone-calendars', 'sync', 'push', 'outbox']);

export const areaOf = (route: string) => /\/api\/([a-z-]+)/.exec(route)?.[1] ?? 'other';
export const isAutomatic = (area: string) => AUTOMATIC.has(area);
export const areaName = (area: string) =>
	AREAS[area] ?? (AUTOMATIC.has(area) ? area.replace(/-/g, ' ') : area[0].toUpperCase() + area.slice(1));

/** A route in words: "POST /api/tasks/:id/done" → "tasks/:id/done (add)". */
export function routeName(route: string) {
	const [method, path = ''] = route.split(' ');
	const verb = { POST: 'add or do', PUT: 'set', PATCH: 'change', DELETE: 'delete' }[method] ?? method;
	return `${path.replace(/^\/api\//, '')} · ${verb}`;
}
