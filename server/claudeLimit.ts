import type { FastifyInstance } from 'fastify';

// Asking Claude costs money: Snap a flyer and Say it, reading a recipe, Dish ideas and Surprise me. Anyone
// can make a free account, so each household gets a fair amount and no more: plenty for a family, and a
// stop for anyone hammering it. Counted per household, in memory (a restart forgets, which is fine).

/** The calls that ask Claude, as "METHOD route". */
const ASKS_CLAUDE = new Set([
	'POST /api/capture',
	'POST /api/recipes/read',
	'POST /api/recipes/ideas',
	'POST /api/recipes/surprise',
]);

export const CLAUDE_LIMITS = { perMinute: 6, perDay: 60 };

export function registerClaudeLimit(app: FastifyInstance, limits = CLAUDE_LIMITS) {
	let asked: number[] = [];
	app.addHook('preHandler', async (req, reply) => {
		if (!ASKS_CLAUDE.has(`${req.method} ${req.routeOptions.url}`)) return;
		const now = Date.now();
		asked = asked.filter((at) => at > now - 86_400_000);
		if (asked.length >= limits.perDay) {
			return reply.code(429).send({ error: "That's a lot of reading for one day. Try again tomorrow." });
		}
		if (asked.filter((at) => at > now - 60_000).length >= limits.perMinute) {
			return reply.code(429).send({ error: 'One moment: try again in a minute.' });
		}
		asked.push(now);
	});
}
