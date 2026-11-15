// The day's joke beside the weather (server/daily.ts): what the route takes and gives back, written once.
// The server checks requests against these and the web app imports their types (types only, so zod
// stays out of its bundle).

import { z } from 'zod';

/** The cards for a local day (GET /api/daily). */
export const DailyQuery = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** A dad joke; null when it couldn't be fetched. (The quote of the day is the app's own, web/src/lib/quotes.ts.) */
export const Daily = z.object({
	joke: z.object({ text: z.string() }).nullable(),
});

export type Daily = z.infer<typeof Daily>;
