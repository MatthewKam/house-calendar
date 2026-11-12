import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import type { DB } from './db.ts';
import { registerMembers } from './members.ts';
import { registerCalendars, type CalendarOptions } from './calendars.ts';
import { registerTasks } from './tasks.ts';
import { registerRewards } from './rewards.ts';
import { registerMoments } from './moments.ts';
import { registerPotty } from './potty.ts';
import { registerGoals } from './goals.ts';
import { registerTravel, type Estimator } from './travel.ts';
import { registerPlaces, type PlaceSearch } from './places.ts';
import { registerWeather } from './weather.ts';
import { registerPhotos } from './photos.ts';
import { registerDaily } from './daily.ts';
import { registerGuard } from './auth.ts';
import { registerPrivacyGuard } from './privacy.ts';
import { registerReminders } from './reminders.ts';
import { registerLists } from './lists.ts';
import { registerPush, type Pusher } from './push.ts';
import { registerCapture, type Understand } from './capture.ts';
import { registerLearn } from './learn.ts';
import { registerEvents } from './events.ts';

export function buildApp(
	db: DB,
	opts: CalendarOptions & {
		webDist?: string;
		/** Called after the family list or a calendar link changes, so Claude can sort what is now unassigned. */
		onAssignmentsChanged?: () => void;
		/** Shared secret the phones' Reminders Shortcut sends; without it, Reminders sync is off. */
		remindersToken?: string;
		/** Called after a list is changed on the wall, so the change can be sent to Reminders soon. */
		onRemindersChanged?: () => void;
		/** Drive-time lookups (Google Maps); without it, travel times are off. */
		travel?: Estimator;
		/** Address suggestions while typing (Google Places); without it, the address is plain text. */
		places?: PlaceSearch;
		/**
		 * Edits to synced events: present when they can be sent to iCloud; soon() sends a new edit after
		 * the Undo window. Without it, synced events are read-only.
		 */
		syncedEdits?: { soon: () => void };
		/** Where album photos are stored; without it, the album is off. */
		photosDir?: string;
		/** How the daily joke, quote and events are fetched (replaced in tests). */
		dailyFetch?: typeof fetch;
		/** How weather lookups reach the internet (replaced in tests). */
		weatherFetch?: typeof fetch;
		/** Called after a person is removed, so their sign-ins to this household go too. */
		onMemberRemoved?: (memberId: string) => void;
		/** Alerts on people's phones (web push); without it, they're off. */
		push?: Pusher;
		/** Reads what's said or a flyer's photo into things to add (Claude); without it, Say it and Snap are off. */
		understand?: Understand;
	} = {},
) {
	// trustProxy: behind Tailscale's HTTPS (tailscale serve), so the device's address and https are seen.
	const app = Fastify({ logger: process.env.NODE_ENV !== 'test' && { level: 'info' }, trustProxy: 'loopback' });

	// Parent-only changes need a guardian (or a device unlocked with a guardian's PIN).
	registerGuard(app);
	// Events someone can't see (privacy.ts) can't be opened or changed either.
	registerPrivacyGuard(app, db);

	// ---- The family (members.ts) --------------------------------------------
	registerMembers(app, db, opts);

	// ---- Events, and edits waiting for iCloud (events.ts) ------------------
	registerEvents(app, db, opts.syncedEdits);

	// ---- Synced calendars, sync status and calendar accounts (calendars.ts) --
	registerCalendars(app, db, opts);

	registerTasks(app, db);
	registerRewards(app, db);
	registerMoments(app, db);
	registerPotty(app, db);
	registerGoals(app, db);
	registerTravel(app, db, opts.travel);
	registerPlaces(app, db, opts.places);
	registerWeather(app, db, opts.weatherFetch);
	registerDaily(app, db, opts.dailyFetch);
	if (opts.photosDir) registerPhotos(app, db, opts.photosDir);
	registerReminders(app, db, opts.remindersToken, opts.onRemindersChanged);
	registerLists(app, db);
	registerPush(app, db, opts.push);
	registerCapture(app, db, opts.understand);
	registerLearn(app, db, opts.push);

	// ---- Display settings (key/value, for things like UI scale) -------------
	app.get('/api/settings', async () => {
		const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
		return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
	});

	app.put<{ Params: { key: string }; Body: { value: unknown } }>(
		'/api/settings/:key',
		{
			schema: {
				params: { type: 'object', properties: { key: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_.]{0,63}$' } } },
				body: { type: 'object', required: ['value'], properties: { value: {} } },
			},
		},
		async (req, reply) => {
			// The household's accent (the wall wears it) is the account holder's pick.
			if (req.params.key === 'accent' && req.raw.viewer && !req.raw.viewer.holder) {
				return reply.code(403).send({ error: "The wall's accent follows the account holder's" });
			}
			db.prepare(
				'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
			).run(req.params.key, JSON.stringify(req.body.value));
			return { [req.params.key]: req.body.value };
		},
	);

	// ---- Built UI (production) ---------------------------------------------
	if (opts.webDist && existsSync(opts.webDist)) {
		app.register(fastifyStatic, { root: opts.webDist });
	}

	return app;
}
