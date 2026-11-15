// Reminders from the family's iPhones (server/reminders.ts): what the routes take and give back, written
// once. The server checks requests against these and the web app imports their types (types only, so zod
// stays out of its bundle). The phones' own routes are the Shortcut's, which sends lists as JSON or text.

import { z } from 'zod';

const title = z.string().min(1).max(300);

/** A new reminder on a list the phones sync (POST /api/reminders), sent to a phone with the next sync. */
export const ReminderAdd = z.strictObject({ list: z.string().min(1).max(200), title });
/** Tick, untick or rename (PATCH /api/reminders/:id): one of these, never both. */
export const ReminderPatch = z.strictObject({ done: z.boolean(), title }).partial();

/** The phone asking (the Shortcut): which phone, by its name. */
const device = z.string().min(1).max(60);
/** Changes from the wall for this phone to make (GET /api/reminders/phone/pending). */
export const PhonePending = z.object({ device });
/**
 * A phone's lists as they are now (POST /api/reminders/phone/sync). `items`, `applied` and `lists` can be
 * JSON or text (Shortcuts sends either); the server reads them.
 */
export const PhoneSync = z.object({ device, items: z.unknown() });

/** A reminder on the wall. */
export const ReminderItem = z.object({
	/** "p…" came from a phone, "w…" was added on the wall. */
	id: z.string(),
	title: z.string(),
	done: z.boolean(),
	due: z.string().nullable(),
	/** Changed on the wall and waiting for a phone to apply it in Reminders. */
	pending: z.boolean(),
});
/** A Reminders list as the wall shows it (synced from the family's iPhones by a Shortcut). */
export const ReminderList = z.object({
	title: z.string(),
	items: z.array(ReminderItem),
	/** Phones that last sent this list, newest first. */
	syncedBy: z.array(z.object({ device: z.string(), at: z.string() })),
});
/** Every list (GET /api/reminders): whether the phones' sync is on. A change gives back the lists alone. */
export const Reminders = z.object({ enabled: z.boolean(), lists: z.array(ReminderList) });

export type ReminderPatch = z.infer<typeof ReminderPatch>;
export type ReminderList = z.infer<typeof ReminderList>;
export type Reminders = z.infer<typeof Reminders>;
