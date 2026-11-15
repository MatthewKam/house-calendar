// "Time to leave" alerts (server/travel.ts): what the alert routes take and give back, written once. The
// server checks requests against these and the web app imports their types (types only, so zod stays out
// of its bundle).

import { z } from 'zod';

/** A new alert for a timed event with an address (POST /api/alerts): how long before leaving to remind. */
export const AlertInput = z.strictObject({ eventId: z.string(), minutesBefore: z.int().min(0).max(120) });

/** A "time to leave" alert the wall shows at `remindAt`. */
export const LeaveAlert = z.object({
	id: z.string(),
	eventId: z.string(),
	title: z.string(),
	destination: z.string(),
	/** When the event starts (an instant). */
	arriveBy: z.string(),
	minutesBefore: z.int(),
	driveMinutes: z.number(),
	leaveAt: z.string(),
	remindAt: z.string(),
});

export type AlertInput = z.infer<typeof AlertInput>;
export type LeaveAlert = z.infer<typeof LeaveAlert>;
