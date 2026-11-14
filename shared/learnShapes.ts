// Learning's requests and replies (server/learn.ts, server/learnDay.ts), written once. The server checks
// requests against these and the web app imports their types. They're kept apart from shared/learn.ts
// because the web app imports that one's games and animals as they are, and zod has to stay out of its bundle.

import { z } from 'zod';
import { GAME_LEVELS, type Game } from './learn.ts';

/** A day, YYYY-MM-DD. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One of the games. */
export const GameName = z.enum(Object.keys(GAME_LEVELS) as [Game, ...Game[]]);
/** A game's level. */
const level = z.int().min(1).max(9);

/** Each kid's learning as of the display's day (GET /api/learn). */
export const LearnQuery = z.object({ today: day });

/**
 * A guardian's change to a kid's learning (PUT /api/learn/:memberId), with the display's day: on or off,
 * games and minutes a day (null minutes: no time limit), and games' levels. At least one besides the day.
 */
export const LearnSettings = z.strictObject({
	enabled: z.boolean().optional(),
	today: day,
	gamesADay: z.int().min(1).max(10).optional(),
	minutesADay: z.int().min(5).max(240).nullable().optional(),
	/** Game: its new level. The server checks each is one of the kid's games and has that level. */
	levels: z.record(z.string(), level).optional(),
});

/** A grown-up's change to a kid's Learn today (POST /api/learn/:memberId/today), with the day. */
export const LearnDayChange = z.strictObject({
	today: day,
	/** Unlocked (true) or locked (false) today; null: back to opening once the Daily tasks are done. */
	open: z.boolean().nullable().optional(),
	moreGames: z.literal(true).optional(),
	moreMinutes: z.literal(true).optional(),
});

/** Time spent in a game, sent every so often while they play (POST /api/learn/:memberId/time). */
export const LearnTime = z.strictObject({ today: day, seconds: z.int().min(1).max(600) });

/** A finished game (POST /api/learn/:memberId/done): rounds played and how many were right the first time. */
export const LearnDone = z.strictObject({
	today: day,
	game: GameName,
	level,
	rounds: z.int().min(1).max(50),
	firstTry: z.int().min(0).max(50),
});

/** A kid's Learn today: what they've used and have, and why they can't start a game (null: they can). */
export const LearnToday = z.object({
	gamesADay: z.int(),
	/** Their time a day (null: no time limit). */
	minutesADay: z.int().nullable(),
	played: z.int(),
	/** Games today: their games a day plus any more from a grown-up. */
	games: z.int(),
	seconds: z.int(),
	/** Minutes today (null: no time limit). */
	minutes: z.int().nullable(),
	/** A grown-up unlocked (true) or locked (false) it today; null: it opens once the Daily tasks are done. */
	unlocked: z.boolean().nullable(),
	tasksDone: z.boolean(),
	why: z.enum(['tasks', 'locked', 'games', 'time']).nullable(),
});

/** A kid's learning: on or off, and their stage's games, each at the level they play it. */
export const LearnState = z.object({
	memberId: z.string(),
	enabled: z.boolean(),
	/** `ready`: a little one's game that would have moved up, waiting for a grown-up to move it. */
	games: z.array(z.object({ game: GameName, level: z.int(), maxLevel: z.int(), ready: z.boolean() })),
	/** Today's Learn (server/learnDay.ts). */
	today: LearnToday,
});
/** What a finished game gives back: the kid's learning, and whether the game moved up. */
export const LearnDoneReply = LearnState.extend({ leveledUp: z.boolean() });

/** An animal noise a grown-up recorded for the games, and when (so a new recording isn't the old one cached). */
export const LearnSound = z.object({ animal: z.string(), version: z.string() });

export type LearnSettings = z.infer<typeof LearnSettings>;
/** A grown-up's change to a kid's Learn today, as the web app has it (the day is added alongside). */
export type LearnDayChange = Omit<z.infer<typeof LearnDayChange>, 'today'>;
export type LearnDone = z.infer<typeof LearnDone>;
export type LearnToday = z.infer<typeof LearnToday>;
export type LearnState = z.infer<typeof LearnState>;
export type LearnDoneReply = z.infer<typeof LearnDoneReply>;
export type LearnSound = z.infer<typeof LearnSound>;
