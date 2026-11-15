import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.ts';
import { schemaOf } from './schemas.ts';
import {
	MealThemeFields,
	MoveMealPlan,
	NewMealPlan,
	type MealPlan,
	type MealTheme,
	type PlanMeal,
	type Plans,
	type Reminder,
} from '../shared/meals.ts';
import type { PrepAhead } from '../shared/recipes.ts';
import { prepReminders } from '../shared/prepTimes.ts';

export { prepReminders };

// Plan ahead (docs/recipes.md): a recipe on a day's breakfast, lunch or dinner, and themed days (Pancake
// Friday) that suggest from a kind each week (the app picks the suggestion). Planning a recipe with prep
// ahead (marinate overnight, thaw) puts a reminder for each on To do, at a sensible time; moving the plan
// moves them, and taking it off takes them off. Changes are a parent's (auth.ts).

/** Plans further back than this aren't sent (the calendar rarely looks that far). */
const KEEP_DAYS = 60;
const MEAL_ORDER = `CASE meal WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END`;

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
	/** The plan's reminders, afresh: as the app sent them (times changed, some off), or worked out here. */
	const remind = (planId: string, recipeId: string, day: string, meal: PlanMeal, tz: string, sent?: Reminder[]) => {
		db.prepare('DELETE FROM list_items WHERE meal_plan_id = ?').run(planId);
		const r = recipe(recipeId);
		const due = sent ?? (r ? prepReminders(r.title, r.prepAhead ?? [], day, meal, tz) : []);
		if (!due.length) return;
		const list = toDo();
		const add = db.prepare('INSERT INTO list_items (id, list_id, title, due, meal_plan_id) VALUES (?, ?, ?, ?, ?)');
		for (const d of due) add.run(randomUUID(), list, d.title, d.due, planId);
	};
	const zoneProblem = { error: 'Unknown time zone' };
	const timeProblem = { error: 'A reminder needs a time' };
	const realTimes = (list?: Reminder[]) => !list || list.every((x) => !Number.isNaN(Date.parse(x.due)));

	app.get('/api/meals', async () => plansOf(db));

	app.post<{ Body: z.infer<typeof NewMealPlan> }>(
		'/api/meals',
		{ schema: { body: schemaOf(NewMealPlan) } },
		async (req, reply) => {
			const { day, meal, recipeId, timeZone, reminders } = req.body;
			if (!realZone(timeZone)) return reply.code(400).send(zoneProblem);
			if (!realTimes(reminders)) return reply.code(400).send(timeProblem);
			if (!recipe(recipeId)) return reply.code(404).send({ error: 'Recipe not found' });
			db.transaction(() => {
				const id = randomUUID();
				db.prepare('INSERT INTO meal_plans (id, day, meal, recipe_id) VALUES (?, ?, ?, ?)').run(
					id,
					day,
					meal,
					recipeId,
				);
				remind(id, recipeId, day, meal, timeZone, reminders);
			})();
			reply.code(201);
			return plansOf(db);
		},
	);

	app.put<{ Params: { id: string }; Body: z.infer<typeof MoveMealPlan> }>(
		'/api/meals/:id',
		{ schema: { body: schemaOf(MoveMealPlan) } },
		async (req, reply) => {
			const { day, meal, timeZone, reminders } = req.body;
			if (!realZone(timeZone)) return reply.code(400).send(zoneProblem);
			if (!realTimes(reminders)) return reply.code(400).send(timeProblem);
			const row = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(req.params.id) as PlanRow | undefined;
			if (!row) return reply.code(404).send({ error: 'Not planned' });
			db.transaction(() => {
				db.prepare('UPDATE meal_plans SET day = ?, meal = ? WHERE id = ?').run(day, meal, row.id);
				remind(row.id, row.recipe_id, day, meal, timeZone, reminders);
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
