import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { schemaOf } from './schemas.ts';
import { LIVE_TIMES, liveAnswer, memberAsking, type LiveTimes } from './shopping.ts';
import type { RecipeFields } from '../shared/recipes.ts';
import {
	CookLength,
	CookMe,
	type CookAlong,
	type CookPerson,
	type CookProgress,
	type CookRoom,
	type CookStatus,
	type LiveCook,
} from '../shared/cook.ts';

// Cooking together: someone cooking a recipe makes a link to it (a secret) and sends it to anyone,
// in the family or not. Whoever opens it cooks along on their own screen with their own ticks and
// timers; everyone sees how far everyone else has got, live (as Shopping together, shopping.ts), but
// nothing they tick changes anyone else's. The link works for a day, or as long as it's set to (a
// recipe over days), until it's ended.
//
// The link's calls (/api/cook/:secret/…) are the only ones that work without signing in: the front
// server (hosted.ts) lets them through to this household when the address is one of them, and they
// show only that recipe and the names of who's cooking.

/** How long a new link works: a day. */
export const COOK_HOURS = 24;

/** Colours for people cooking along who aren't in the family (each has their own). */
const GUEST_COLORS = ['#e07a5f', '#3d85c6', '#5e9e7e', '#e0a030', '#8e6cc7', '#d6537a'];

interface RoomRow {
	id: string;
	secret: string;
	recipe_id: string;
	until: number;
}
interface PersonRow {
	cook_id: string;
	name: string;
	member_id: string | null;
	progress: string;
	joined_at: number;
	seen_at: number;
}

export function registerCook(app: FastifyInstance, db: DB, opts: { dir?: string; live?: LiveTimes } = {}) {
	const live = opts.live ?? LIVE_TIMES;

	/** The recipe's link, while it works (an old one is cleared away). */
	function roomOf(recipeId: string) {
		db.prepare('DELETE FROM cook_rooms WHERE until <= ?').run(Date.now());
		return db.prepare('SELECT * FROM cook_rooms WHERE recipe_id = ?').get(recipeId) as RoomRow | undefined;
	}
	/** The link with this secret, while it works. */
	function roomBySecret(secret: string) {
		db.prepare('DELETE FROM cook_rooms WHERE until <= ?').run(Date.now());
		return db.prepare('SELECT * FROM cook_rooms WHERE secret = ?').get(secret) as RoomRow | undefined;
	}

	/** Who's cooking, in the order they joined: family by their own name and colour, others by theirs. */
	function statusOf(room: RoomRow): CookStatus {
		const rows = db
			.prepare('SELECT * FROM cook_people WHERE room_id = ? ORDER BY joined_at')
			.all(room.id) as PersonRow[];
		let guests = 0;
		const people = rows.map((r): CookPerson => {
			const member = r.member_id
				? (db.prepare('SELECT name, color FROM members WHERE id = ?').get(r.member_id) as
						{ name: string; color: string } | undefined)
				: undefined;
			return {
				cookId: r.cook_id,
				name: member?.name ?? r.name,
				color: member?.color ?? GUEST_COLORS[guests++ % GUEST_COLORS.length],
				memberId: member ? r.member_id : null,
				progress: JSON.parse(r.progress) as CookProgress,
				seenAt: r.seen_at,
			};
		});
		return { until: room.until, people };
	}
	const roomFor = (room: RoomRow): CookRoom => ({ secret: room.secret, ...statusOf(room) });

	const recipeExists = (id: string) => !!db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(id);
	const notForKids = (req: FastifyRequest) => req.raw.viewer?.role === 'kid';

	// ---- The family's side: the recipe's link ------------------------------------------------------

	app.get<{ Params: { id: string } }>('/api/recipes/:id/cook', async (req, reply) => {
		if (!recipeExists(req.params.id)) return reply.code(404).send({ error: 'Recipe not found' });
		const room = roomOf(req.params.id);
		return { room: room ? roomFor(room) : null };
	});

	// A link to cook it together: the one going, or a new one for a day.
	app.post<{ Params: { id: string } }>('/api/recipes/:id/cook', async (req, reply) => {
		if (notForKids(req)) return reply.code(403).send({ error: 'Cooking together is started by a grown-up' });
		if (!recipeExists(req.params.id)) return reply.code(404).send({ error: 'Recipe not found' });
		let room = roomOf(req.params.id);
		if (!room) {
			db.prepare('INSERT INTO cook_rooms (id, secret, recipe_id, until) VALUES (?, ?, ?, ?)').run(
				randomUUID(),
				randomBytes(24).toString('base64url'),
				req.params.id,
				Date.now() + COOK_HOURS * 3_600_000,
			);
			room = roomOf(req.params.id)!;
			reply.code(201);
		}
		return { room: roomFor(room) };
	});

	// How long it keeps working, from now.
	app.put<{ Params: { id: string }; Body: CookLength }>(
		'/api/recipes/:id/cook',
		{ schema: { body: schemaOf(CookLength) } },
		async (req, reply) => {
			if (notForKids(req)) return reply.code(403).send({ error: 'Cooking together is changed by a grown-up' });
			const room = roomOf(req.params.id);
			if (!room) return reply.code(404).send({ error: 'Cooking together has ended' });
			db.prepare('UPDATE cook_rooms SET until = ? WHERE id = ?').run(Date.now() + req.body.hours * 3_600_000, room.id);
			return { room: roomFor(roomOf(req.params.id)!) };
		},
	);

	// Ended: the link stops working for everyone.
	app.delete<{ Params: { id: string } }>('/api/recipes/:id/cook', async (req, reply) => {
		if (notForKids(req)) return reply.code(403).send({ error: 'Cooking together is ended by a grown-up' });
		db.prepare('DELETE FROM cook_rooms WHERE recipe_id = ?').run(req.params.id);
		return reply.code(204).send();
	});

	// ---- The link's side: anyone with it ------------------------------------------------------------

	const ENDED = { error: 'This cooking link has ended. Ask for a new one.' };

	// The recipe (its photos at the link's own addresses) and who's cooking.
	app.get<{ Params: { secret: string } }>('/api/cook/:secret', async (req, reply): Promise<CookAlong | undefined> => {
		const room = roomBySecret(req.params.secret);
		if (!room) return reply.code(404).send(ENDED);
		const row = db.prepare('SELECT data, cover_id FROM recipes WHERE id = ?').get(room.recipe_id) as {
			data: string;
			cover_id: string | null;
		};
		const pictures = db
			.prepare('SELECT id, step FROM recipe_images WHERE recipe_id = ? ORDER BY sort_order')
			.all(room.recipe_id) as { id: string; step: number | null }[];
		const at = (id: string) => `images/${id}`;
		const cover = row.cover_id === '' ? null : (row.cover_id ?? pictures.find((p) => p.step === null)?.id ?? null);
		return {
			recipe: {
				...(JSON.parse(row.data) as RecipeFields),
				images: pictures.map((p) => ({ url: at(p.id), step: p.step })),
				coverUrl: cover ? at(cover) : null,
			},
			...statusOf(room),
		};
	});

	// Joining, and saying where you've got to after each tick (the same call).
	app.put<{ Params: { secret: string }; Body: CookMe }>(
		'/api/cook/:secret/me',
		{ schema: { body: schemaOf(CookMe) } },
		async (req, reply) => {
			const room = roomBySecret(req.params.secret);
			if (!room) return reply.code(404).send(ENDED);
			const { cookId, progress } = req.body;
			const name = req.body.name.trim().replace(/\s+/g, ' ');
			if (!name) return reply.code(400).send({ error: 'A name is needed' });
			const now = Date.now();
			db.prepare(
				`INSERT INTO cook_people (room_id, cook_id, name, member_id, progress, joined_at, seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (room_id, cook_id) DO UPDATE SET name = excluded.name,
           member_id = COALESCE(excluded.member_id, member_id), progress = excluded.progress, seen_at = excluded.seen_at`,
			).run(room.id, cookId, name, memberAsking(db, req.raw.viewer), JSON.stringify(progress), now, now);
			return statusOf(room);
		},
	);

	// As soon as anyone's progress changes, or as it is after a while. Asked over and over while cooking.
	app.get<{ Params: { secret: string }; Querystring: { stamp?: string } }>(
		'/api/cook/:secret/live',
		async (req, reply): Promise<LiveCook | undefined> => {
			const first = roomBySecret(req.params.secret);
			if (!first) return reply.code(404).send(ENDED);
			const { stamp, value } = await liveAnswer(
				() => {
					const room = roomBySecret(req.params.secret);
					return room ? statusOf(room) : null;
				},
				req.query.stamp,
				reply,
				live,
			);
			if (!value) return reply.code(404).send(ENDED);
			return { stamp, ...value };
		},
	);

	// The recipe's photos, for the link (only that recipe's).
	app.get<{ Params: { secret: string; imageId: string } }>('/api/cook/:secret/images/:imageId', async (req, reply) => {
		const room = roomBySecret(req.params.secret);
		const ok =
			room &&
			opts.dir &&
			db.prepare('SELECT 1 FROM recipe_images WHERE id = ? AND recipe_id = ?').get(req.params.imageId, room.recipe_id);
		const file = opts.dir && join(opts.dir, `${req.params.imageId}.jpg`);
		if (!ok || !file || !existsSync(file)) return reply.code(404).send({ error: 'Not found' });
		return reply.header('cache-control', 'private, max-age=86400').type('image/jpeg').send(readFileSync(file));
	});
}
