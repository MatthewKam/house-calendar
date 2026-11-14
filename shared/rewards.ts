// Reward jars (server/rewards.ts): what the server takes and gives back, written once. The server checks
// requests against these and the web app imports their types (types only, so zod stays out of its bundle).

import { z } from 'zod';

/** A day, YYYY-MM-DD. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Stars in a jar or moved at once. */
const stars = z.int().min(1).max(100000);

/** With several kids: their stars added together (pooled), or each kid putting in the full amount. */
export const TeamMode = z.enum(['pooled', 'each']);

/** What can be set on a jar, with nothing filled in: an edit changes only what it sends. */
const rewardFields = {
	title: z.string().min(1).max(80),
	/** Stars to fill it. */
	goal: stars,
	teamMode: TeamMode,
	/** Who can fill it: one kid, or several together (each once). */
	memberIds: z.array(z.string()).min(1).max(20).meta({ uniqueItems: true }),
	/** Last day to redeem it; none means it empties after it's redeemed and fills again. */
	deadline: day.nullable(),
};

/** Jars still going, as of the display's day (GET /api/rewards). */
export const RewardsQuery = z.object({ today: day });

/** A new jar (POST /api/rewards), with the display's day. Left out: pooled, no deadline. */
export const RewardInput = z.strictObject({
	...rewardFields,
	teamMode: rewardFields.teamMode.default('pooled'),
	deadline: rewardFields.deadline.default(null),
	today: day,
});
/** A change to a jar (PATCH /api/rewards/:id, the day in the query): any of its fields, at least one. */
export const RewardPatch = z.strictObject(rewardFields).partial();

/** Stars a kid puts in jars at once (POST /api/rewards/place); with `from`, taken out of that missed jar first. */
export const StarPlacing = z.strictObject({
	memberId: z.string(),
	today: day,
	from: z.string().optional(),
	places: z.array(z.strictObject({ rewardId: z.string(), stars })).max(50),
});

/** A missed jar back on the list, with a new deadline or none (POST /api/rewards/:id/restore). */
export const RewardRestore = z.strictObject({ deadline: rewardFields.deadline, today: day });

/** A parent takes some of a kid's stars back out of a jar (POST /api/rewards/:id/take-back). */
export const TakeBack = z.strictObject({ memberId: z.string(), stars });

/**
 * A reward jar. Kids put stars from their bucket in it (they can't take them back out); once it's full
 * it's earned, a RewardWin waiting to be redeemed. A jar with a deadline is missed if it isn't
 * redeemed by then, and the kids move their stars back out.
 */
export const Reward = z.object({
	id: z.string(),
	memberIds: z.array(z.string()),
	title: z.string(),
	goal: z.int(),
	teamMode: TeamMode,
	deadline: z.string().nullable(),
	/** Stars in it now (everyone's together). */
	stars: z.int(),
	/** Each kid's part of `stars`. */
	memberStars: z.record(z.string(), z.int()),
	/** earned: full, waiting to be redeemed (shown as its win). missed: its deadline passed. */
	status: z.enum(['filling', 'earned', 'missed']),
});

/** One time a jar was filled (then redeemed) or missed, kept even if the jar changes later. */
export const RewardWin = z.object({
	id: z.string(),
	rewardId: z.string(),
	title: z.string(),
	memberIds: z.array(z.string()),
	goal: z.int(),
	stars: z.int(),
	/** Who put in how many. */
	memberStars: z.record(z.string(), z.int()),
	earnedDay: z.string(),
	givenAt: z.string().nullable(),
	/** Missed: the deadline it didn't make. */
	missedOn: z.string().nullable(),
});

/** Stars a kid can still put in jars. */
export const Bucket = z.object({ memberId: z.string(), stars: z.int() });

export type TeamMode = z.infer<typeof TeamMode>;
/** A new jar with every field there (what the server has once the defaults are filled in). */
export type RewardInput = z.output<typeof RewardInput>;
/** A new jar as the web app sends it: every field, the day added alongside. */
export type NewReward = Omit<RewardInput, 'today'>;
export type RewardPatch = z.infer<typeof RewardPatch>;
export type StarPlacing = z.infer<typeof StarPlacing>;
export type Reward = z.infer<typeof Reward>;
export type RewardWin = z.infer<typeof RewardWin>;
export type Bucket = z.infer<typeof Bucket>;
