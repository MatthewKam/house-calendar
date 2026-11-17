// Alerts on grown-ups' phones (server/push.ts): what the push routes take and give back, written once.
// The server checks requests against these. A browser sends its own subscription (PushSubscriptionJSON),
// which Subscription is the part of that the server keeps; the iPhone app sends its Apple device token.

import { z } from 'zod';

/** A browser's push subscription, as PushSubscription.toJSON() gives it. */
export const Subscription = z.object({
	endpoint: z
		.string()
		.regex(/^https:\/\//)
		.max(1000),
	keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

/** The iPhone app's address with Apple (APNs); `sandbox` for a build run from Xcode, not TestFlight or the App Store. */
export const AppleDevice = z.object({
	token: z.string().regex(/^[0-9a-fA-F]{64,200}$/),
	sandbox: z.boolean(),
});

/** Turning alerts on for this device (POST /api/push), with its time zone for quiet hours and days: a
    browser's subscription or the app's Apple device, one of the two (PUSH_ON_ONE_OF). */
export const PushOn = z.strictObject({
	subscription: Subscription.optional(),
	apple: AppleDevice.optional(),
	timeZone: z.string().max(64),
});
/** What the route adds to PushOn's JSON schema: exactly one of the two. (A zod choice of two shapes didn't
    work: the request checker dropped the second's field while trying the first.) */
export const PUSH_ON_ONE_OF = { oneOf: [{ required: ['subscription'] }, { required: ['apple'] }] };
/** Turning them off (DELETE /api/push), or sending a test (POST /api/push/test): a browser's endpoint, or
    `apple:` and the app's token (appleEndpoint). */
export const PushOff = z.object({ endpoint: z.string().max(1000) });

/** How the app's device is named in place of a browser's endpoint. */
export const appleEndpoint = (token: string) => `apple:${token.toLowerCase()}`;

/** The server's public key, to subscribe with (GET /api/push/key). */
export const PushKey = z.object({ publicKey: z.string() });

export type Subscription = z.infer<typeof Subscription>;
export type AppleDevice = z.infer<typeof AppleDevice>;
export type PushOn = z.infer<typeof PushOn>;
export type PushKey = z.infer<typeof PushKey>;
