// Alerts on grown-ups' phones (server/push.ts): what the push routes take and give back, written once.
// The server checks requests against these. The web app sends the browser's own subscription
// (PushSubscriptionJSON), which this shape is the part of that the server keeps.

import { z } from 'zod';

/** A browser's push subscription, as PushSubscription.toJSON() gives it. */
export const Subscription = z.object({
	endpoint: z
		.string()
		.regex(/^https:\/\//)
		.max(1000),
	keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

/** Turning alerts on for this device (POST /api/push), with its time zone for quiet hours and days. */
export const PushOn = z.strictObject({ subscription: Subscription, timeZone: z.string().max(64) });
/** Turning them off (DELETE /api/push). */
export const PushOff = z.object({ endpoint: z.string().max(1000) });

/** The server's public key, to subscribe with (GET /api/push/key). */
export const PushKey = z.object({ publicKey: z.string() });

export type Subscription = z.infer<typeof Subscription>;
export type PushOn = z.infer<typeof PushOn>;
export type PushKey = z.infer<typeof PushKey>;
