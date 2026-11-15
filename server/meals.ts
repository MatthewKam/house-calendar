import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { atLocal } from './push.ts';
import { schemaOf } from './schemas.ts';
import {
	MealThemeFields,
	MoveMealPlan,
	NewMealPlan,
	type MealPlan,
	type MealTheme,
	type PlanMeal,
	type Plans,
} from '../shared/meals.ts';
import type { PrepAhead } from '../shared/recipes.ts';

// Plan ahead (docs/recipes.md): a recipe on a day's breakfast, lunch or dinner, and themed days (Pancake
// Friday) that suggest from a kind each week (the app picks the suggestion). Planning a recipe with prep
// ahead (marinate overnight, thaw) puts a reminder for each on To do, at a sensible time; moving the plan
// moves them, and taking it off takes them off. Changes are a parent's (auth.ts).

/** When each meal usually is, for working out when prep starts. */
const MEAL_HOUR: Record<PlanMeal, number> = { breakfast: 8, lunch: 12, dinner: 18 };
/** Prep that would start in the night (from 9 PM to 7 AM) is moved to 8 PM the evening before. */
const NIGHT_FROM = 21;
const NIGHT_TO = 7;
const EVENING = 20;
/** Plans further back than this aren't sent (the calendar rarely looks that far). */
const KEEP_DAYS = 60;
const MEAL_ORDER = `CASE meal WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END`;

/** The day (YYYY-MM-DD) and hour an instant falls on in time zone `tz`. */
function localAt(t: number, tz: string) {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
		})
			.formatToParts(t)
			.map((x) => [x.type, x.value]),
	);
	return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** The day `n` days after `day` (YYYY-MM-DD). */
const addDays = (day: string, n: number) => {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * The reminders a planned recipe brings: one for each thing to do ahead, at the meal's usual time less
 * how long ahead it is, out of the night. "Tonight: marinate the chicken for tomorrow's dinner (Korean beef)".
 */
export function prepReminders(title: string, prep: PrepAhead[], day: string, meal: PlanMeal, tz: string) {
	const at = atLocal(day, MEAL_HOUR[meal], tz);
	return prep
		.filter((p) => p.hoursBefore > 0)
		.map((p) => {
			let t = at - p.hoursBefore * 3_600_000;
			const start = localAt(t, tz);
			if (start.hour >= NIGHT_FROM) t = atLocal(start.day, EVENING, tz);
			else if (start.hour < NIGHT_TO) t = atLocal(addDays(start.day, -1), EVENING, tz);
			const when = localAt(t, tz);
			const ahead = daysBetween(when.day, day);
			const whose =
				ahead === 0
					? 'today’s'
					: ahead === 1
						? 'tomorrow’s'
						: `${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}’s`;
			const what = p.what.trim().replace(/[.\s]+$/, '');
			const tonight = ahead > 0 && when.hour >= 17;
			const said = tonight ? `Tonight: ${what[0].toLowerCase()}${what.slice(1)}` : what;
			return { title: `${said} for ${whose} ${meal} (${title})`.slice(0, 300), due: new Date(t).toISOString() };
		});
}

const realZone = (tz: string) => {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
};

interface PlanRow {
	id: string;
	day: string;
	meal: PlanMeal;
	recipe_id: string;
}
interface ThemeRow {
	id: string;
	name: string;
	emoji: string;
	weekday: number;
	meal: PlanMeal;
	pick_from: string;
}

export function plansOf(db: DB): Plans {
	const rows = db
		.prepare(`SELECT * FROM meal_plans WHERE day >= date('now', ?) ORDER BY day, ${MEAL_ORDER}, created_at`)
		.all(`-${KEEP_DAYS} days`) as PlanRow[];
	const items = db
		.prepare('SELECT id, title, due, done, meal_plan_id FROM list_items WHERE meal_plan_id IS NOT NULL ORDER BY due')
		.all() as { id: string; title: string; due: string; done: number; meal_plan_id: string }[];
	const meals: MealPlan[] = rows.map((r) => ({
		id: r.id,
		day: r.day,
		meal: r.meal,
		recipeId: r.recipe_id,
		reminders: items
			.filter((i) => i.meal_plan_id === r.id)
			.map((i) => ({ id: i.id, title: i.title, due: i.due, done: i.done === 1 })),
	}));
	const themes: MealTheme[] = (
		db.prepare('SELECT * FROM meal_themes ORDER BY weekday, created_at').all() as ThemeRow[]
	).map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, weekday: t.weekday, meal: t.meal, from: t.pick_from }));
	return { meals, themes };
}

export function registerMeals(app: FastifyInstance, db: DB) {
	const recipe = (id: string) => {
		const row = db.prepare('SELECT data FROM recipes WHERE id = ?').get(id) as { data: string } | undefined;
		return row && (JSON.parse(row.data) as { title: string; prepAhead: PrepAhead[] });
	};
	/** To do (found by name, or made): where prep reminders go. */
	const toDo = () => {
		const found = db.prepare(`SELECT id FROM lists WHERE title = 'To do' COLLATE NOCASE`).get() as
			{ id: string } | undefined;
		if (found) return found.id;
		const id = randomUUID();
		db.prepare('INSERT INTO lists (id, title) VALUES (?, ?)').run(id, 'To do');
		return id;
	};
	/** The plan's reminders, afresh. */
	const remind = (planId: string, recipeId: string, day: string, meal: PlanMeal, tz: string) => {
		db.prepare('DELETE FROM list_items WHERE meal_plan_id = ?').run(planId);
		const r = recipe(recipeId);
		const due = r ? prepReminders(r.title, r.prepAhead ?? [], day, meal, tz) : [];
		if (!due.length) return;
		const list = toDo();
		const add = db.prepare('INSERT INTO list_items (id, list_id, title, due, meal_plan_id) VALUES (?, ?, ?, ?, ?)');
		for (const d of due) add.run(randomUUID(), list, d.title, d.due, planId);
	};
	const zoneProblem = { error: 'Unknown time zone' };

	app.get('/api/meals', async () => plansOf(db));

	app.post<{ Body: z.infer<typeof NewMealPlan> }>(
		'/api/meals',
		{ schema: { body: schemaOf(NewMealPlan) } },
		async (req, reply) => {
			const { day, meal, recipeId, timeZone } = req.body;
			if (!realZone(timeZone)) return reply.code(400).send(zoneProblem);
			if (!recipe(recipeId)) return reply.code(404).send({ error: 'Recipe not found' });
			db.transaction(() => {
				const id = randomUUID();
				db.prepare('INSERT INTO meal_plans (id, day, meal, recipe_id) VALUES (?, ?, ?, ?)').run(
					id,
					day,
					meal,
					recipeId,
				);
				remind(id, recipeId, day, meal, timeZone);
			})();
			reply.code(201);
			return plansOf(db);
		},
	);

	app.put<{ Params: { id: string }; Body: z.infer<typeof MoveMealPlan> }>(
		'/api/meals/:id',
		{ schema: { body: schemaOf(MoveMealPlan) } },
		async (req, reply) => {
			const { day, meal, timeZone } = req.body;
			if (!realZone(timeZone)) return reply.code(400).send(zoneProblem);
			const row = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(req.params.id) as PlanRow | undefined;
			if (!row) return reply.code(404).send({ error: 'Not planned' });
			db.transaction(() => {
				db.prepare('UPDATE meal_plans SET day = ?, meal = ? WHERE id = ?').run(day, meal, row.id);
				remind(row.id, row.recipe_id, day, meal, timeZone);
			})();
			return plansOf(db);
		},
	);

	// Off the plan; its reminders go with it (the database's cascade).
	app.delete<{ Params: { id: string } }>('/api/meals/:id', async (req, reply) => {
		if (!db.prepare('DELETE FROM meal_plans WHERE id = ?').run(req.params.id).changes)
			return reply.code(404).send({ error: 'Not planned' });
		return plansOf(db);
	});

	const tidy = (b: MealThemeFields) => ({
		...b,
		name: b.name.trim().replace(/\s+/g, ' '),
		from: b.from.trim().toLowerCase(),
	});
	app.post<{ Body: MealThemeFields }>(
		'/api/meal-themes',
		{ schema: { body: schemaOf(MealThemeFields) } },
		async (req, reply) => {
			const t = tidy(req.body);
			if (!t.name || !t.from) return reply.code(400).send({ error: 'A name and what to suggest are needed' });
			db.prepare('INSERT INTO meal_themes (id, name, emoji, weekday, meal, pick_from) VALUES (?, ?, ?, ?, ?, ?)').run(
				randomUUID(),
				t.name,
				t.emoji,
				t.weekday,
				t.meal,
				t.from,
			);
			reply.code(201);
			return plansOf(db);
		},
	);
	app.put<{ Params: { id: string }; Body: MealThemeFields }>(
		'/api/meal-themes/:id',
		{ schema: { body: schemaOf(MealThemeFields) } },
		async (req, reply) => {
			const t = tidy(req.body);
			if (!t.name || !t.from) return reply.code(400).send({ error: 'A name and what to suggest are needed' });
			const res = db
				.prepare('UPDATE meal_themes SET name = ?, emoji = ?, weekday = ?, meal = ?, pick_from = ? WHERE id = ?')
				.run(t.name, t.emoji, t.weekday, t.meal, t.from, req.params.id);
			if (!res.changes) return reply.code(404).send({ error: 'Themed day not found' });
			return plansOf(db);
		},
	);
	app.delete<{ Params: { id: string } }>('/api/meal-themes/:id', async (req, reply) => {
		if (!db.prepare('DELETE FROM meal_themes WHERE id = ?').run(req.params.id).changes)
			return reply.code(404).send({ error: 'Themed day not found' });
		return plansOf(db);
	});
}
