import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Who is asking, as the front server (hosted.ts) worked out from the sign-in: a guardian, a kid, or
// the family wall. Guardians signed in on their own phone can change anything; a wall or a kid's
// device needs a guardian's PIN first (the parent unlock) for the changes listed below. Without a
// viewer (tests, or a household app used on its own) everything is open.

export interface Viewer {
	role: 'guardian' | 'kid' | 'wall';
	/** The person in this household's members, for a guardian or kid. */
	memberId: string | null;
	/** May make parent-only changes right now. */
	parent: boolean;
	/** The account holder (on their own device, or a device they unlocked with their PIN): approves color changes. */
	holder: boolean;
	/** Who is making the change: the person signed in, or on a device unlocked with a PIN, whose PIN it was. */
	actor: string | null;
	/** The guardians, as members of this household: only they change their own color. */
	guardians: string[];
	/** A parent-only change was made: keeps a wall or kid device's unlock going. */
	stillParent(): void;
	/** A guardian has given consent for this household's children (COPPA); false: children can't be added. */
	childConsent?: boolean;
}

declare module 'node:http' {
	interface IncomingMessage {
		viewer?: Viewer;
	}
}

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function hashPin(pin: string) {
	const salt = randomBytes(16).toString('hex');
	return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`;
}
export function pinMatches(pin: string, stored: string) {
	const [salt, hash] = stored.split(':');
	const got = scryptSync(pin, salt, 32);
	const want = Buffer.from(hash, 'hex');
	return got.length === want.length && timingSafeEqual(got, want);
}

/** "iPhone · Safari", "Mac · Chrome": enough to tell devices apart in Settings. */
export function deviceLabel(ua = '') {
	const device = /iPhone/.test(ua)
		? 'iPhone'
		: /iPad/.test(ua)
			? 'iPad'
			: /Android/.test(ua)
				? 'Android'
				: /Macintosh/.test(ua)
					? 'Mac'
					: /Linux/.test(ua)
						? 'Linux'
						: /Windows/.test(ua)
							? 'Windows'
							: 'Device';
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /CriOS|Chrome\//.test(ua)
			? 'Chrome'
			: /FxiOS|Firefox\//.test(ua)
				? 'Firefox'
				: /Safari\//.test(ua)
					? 'Safari'
					: 'browser';
	return `${device} · ${browser}`;
}

/**
 * Changes that need a parent: everything except what the kids do themselves (ticking tasks, putting
 * stars in jars, redeeming, uploading photos, adding and ticking list items). By route, and for a few
 * routes by what's being changed.
 */
type Req = FastifyRequest<{ Params: Record<string, string>; Body: Record<string, unknown> | undefined }>;
const PARENT_ONLY: [method: string, route: string, when?: (req: Req) => boolean][] = [
	['POST', '/api/events'],
	['PATCH', '/api/events/:id'],
	['DELETE', '/api/events/:id'],
	['POST', '/api/events/:id/restore'],
	['PUT', '/api/events/:id/people'],
	['POST', '/api/outbox/:id/resolve'],
	['POST', '/api/connections/icloud'],
	['POST', '/api/alerts'],
	['DELETE', '/api/alerts/:id'],
	['POST', '/api/capture'],
	['PUT', '/api/learn/:memberId'],
	['PUT', '/api/learn/sounds/:animal'],
	['DELETE', '/api/learn/sounds/:animal'],
	['POST', '/api/tasks'],
	['PATCH', '/api/tasks/:id'],
	['DELETE', '/api/tasks/:id'],
	['PUT', '/api/tasks/order'],
	['POST', '/api/rewards'],
	['PATCH', '/api/rewards/:id'],
	['DELETE', '/api/rewards/:id'],
	['POST', '/api/rewards/:id/restore'],
	['POST', '/api/rewards/:id/take-back'],
	// A kid's own device puts stars in jars only with a parent there.
	['POST', '/api/rewards/place', (req) => req.raw.viewer?.role === 'kid'],
	// Kids redeem; a grown-up says when the reward was actually handed over (or takes that back).
	['POST', '/api/rewards/wins/:id/given'],
	['POST', '/api/rewards/wins/:id/undo'],
	['PUT', '/api/events/:id/visibility'],
	['POST', '/api/moments'],
	['DELETE', '/api/moments/:id'],
	// Kids punch their own potty card; starting, stopping and taking a punch back are a parent's.
	['PUT', '/api/potty/:memberId'],
	['DELETE', '/api/potty/:memberId/:step'],
	['PUT', '/api/goals/library/:key'],
	['PUT', '/api/goals/library'],
	['POST', '/api/goals/library'],
	['POST', '/api/members'],
	['PATCH', '/api/members/:id'],
	['DELETE', '/api/members/:id'],
	['PATCH', '/api/calendars/:id'],
	// Month or week is anyone's choice, and so is a list's order (an unticked item leaves it); the rest of Settings isn't.
	['PUT', '/api/settings/:key', (req) => !['view', 'listOrder'].includes(req.params.key)],
	['PATCH', '/api/photos/:id'],
	['DELETE', '/api/photos/:id'],
	['POST', '/api/photos/slideshow'],
	['POST', '/api/photos/delete'],
	// List items: anyone adds and ticks, and a grown-up or the wall edits one (its ✏️: name, icon, when,
	// who) or deletes it without the PIN; a kid's own device only ticks.
	['PATCH', '/api/reminders/:id', (req) => req.raw.viewer?.role === 'kid' && req.body?.title !== undefined],
	['DELETE', '/api/lists/items/:id', (req) => req.raw.viewer?.role === 'kid'],
	[
		'PATCH',
		'/api/lists/items/:id',
		(req) => req.raw.viewer?.role === 'kid' && Object.keys(req.body ?? {}).some((k) => k !== 'done'),
	],
	// Sprig's own lists: making, renaming and deleting one is a parent's.
	['POST', '/api/lists'],
	['PATCH', '/api/lists/:id'],
	['DELETE', '/api/lists/:id'],
	['PUT', '/api/events/:id/special'],
	// What to bring: changing the list is a parent's; ticking it is anyone's.
	['PUT', '/api/events/:id/checklist'],
	// A day's plans: a parent's, ticks too (kids don't see them).
	['PUT', '/api/day-plans/:key/note'],
	['PUT', '/api/day-plans/:key/list'],
	['PUT', '/api/day-plans/:key/list/:itemId'],
	// Learn's day: unlocking, locking, more games or minutes.
	['POST', '/api/learn/:memberId/today'],
	// Recipes: reading, adding, changing and deleting are a parent's (looking is anyone's).
	['POST', '/api/recipes/read'],
	// Dish ideas and Surprise me ask Claude (a cost): a parent's.
	['POST', '/api/recipes/ideas'],
	['POST', '/api/recipes/surprise'],
	['POST', '/api/recipes'],
	['PUT', '/api/recipes/:id'],
	['DELETE', '/api/recipes/:id'],
	['POST', '/api/recipes/:id/images'],
	['PUT', '/api/recipes/:id/cover'],
	['DELETE', '/api/recipes/:id/images/:imageId'],
	// Tags and notes after cooking: a parent's (saving a time it was cooked is anyone's, without a note).
	['PUT', '/api/recipes/:id/tags'],
	['POST', '/api/recipes/:id/notes'],
	['PUT', '/api/recipes/:id/notes/:noteId'],
	['DELETE', '/api/recipes/:id/notes/:noteId'],
	['POST', '/api/recipes/:id/cooks', (req) => typeof req.body?.note === 'string' && req.body.note.trim() !== ''],
	// Rating a recipe is done on a grown-up's screen.
	['PUT', '/api/recipes/:id/ratings/:memberId'],
	// Cooking together (a link anyone can open to cook along): cooking needs a grown-up.
	['POST', '/api/recipes/:id/cook'],
	['PUT', '/api/recipes/:id/cook'],
	['DELETE', '/api/recipes/:id/cook'],
	// Plan ahead: planning meals and themed days is a parent's (seeing the plan is anyone's).
	['POST', '/api/meals'],
	['PUT', '/api/meals/:id'],
	['DELETE', '/api/meals/:id'],
	['POST', '/api/meal-themes'],
	['PUT', '/api/meal-themes/:id'],
	['DELETE', '/api/meal-themes/:id'],
];
const needsParent = (req: Req) =>
	PARENT_ONLY.some(
		([method, route, when]) => req.method === method && req.routeOptions.url === route && (!when || when(req)),
	);

/** Parent changes from a locked device are refused; a parent's change keeps the unlock going. */
export function registerGuard(app: FastifyInstance) {
	app.addHook('preHandler', async (req, reply) => {
		const viewer = req.raw.viewer;
		if (!viewer || !needsParent(req as Req)) return;
		if (!viewer.parent)
			return reply.code(403).send({ error: "Locked: unlock with a guardian's PIN to change this", locked: true });
		viewer.stillParent();
	});
}
