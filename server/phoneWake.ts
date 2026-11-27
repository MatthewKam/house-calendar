import type { DB } from './db.ts';
import type { ApplePusher } from './apns.ts';
import { SEND_AFTER_MS } from './outbox.ts';

// Changes made in Sprig to a phone's calendars wait until the phone next sends (phoneOutbox.ts). So that's
// within seconds rather than whenever it's next opened, the phone is woken with a silent push from Apple
// once Undo has passed: it sends its calendars and saves the changes, without showing anything. iOS rations
// these and skips an app the person swiped away; then the change waits for the next open, as before.

/** How long after a wake before the same phone is woken again (iOS gives a phone only a few an hour). */
const AGAIN_AFTER_MS = 20_000;

interface PhoneRow {
	id: string;
	wake_token: string;
	wake_sandbox: number;
}

/**
 * Wakes each phone that changes are waiting for and that can be woken, unless it was woken just now (held:
 * try again later). Returns the phones woken and how many were held.
 */
export async function wakePhones(db: DB, apple: ApplePusher, last: Map<string, number>, now = Date.now()) {
	const phones = db
		.prepare(
			`SELECT DISTINCT p.id, p.wake_token, p.wake_sandbox FROM phones p
    JOIN calendars c ON c.source = 'phone:' || p.id JOIN event_outbox o ON o.calendar_id = c.id
    WHERE p.wake_token IS NOT NULL AND c.writable = 1 AND o.state = 'pending' AND o.send_after <= ?`,
		)
		.all(new Date(now).toISOString()) as PhoneRow[];
	const woken: string[] = [];
	let held = 0;
	for (const p of phones) {
		if (now - (last.get(p.id) ?? 0) < AGAIN_AFTER_MS) {
			held++;
			continue;
		}
		last.set(p.id, now);
		try {
			await apple.wake({ token: p.wake_token, sandbox: p.wake_sandbox === 1 }, 'calendars');
			woken.push(p.id);
		} catch (err) {
			// Sprig is gone from that phone (or it's another build's token): stop trying it.
			if ((err as { statusCode?: number }).statusCode === 410)
				db.prepare('UPDATE phones SET wake_token = NULL WHERE id = ? AND wake_token = ?').run(p.id, p.wake_token);
		}
	}
	return { woken, held };
}

/** For one household: wake the phones a little after a change (once Undo has passed), a few changes at a time. */
export function phoneWaker(db: DB, apple: ApplePusher | undefined, onError?: (err: unknown) => void) {
	const last = new Map<string, number>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	const later = (ms: number) => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(run, ms);
		timer.unref?.();
	};
	const run = () => {
		timer = null;
		if (!apple) return;
		wakePhones(db, apple, last)
			.then(({ held }) => {
				if (held && !timer) later(AGAIN_AFTER_MS);
			})
			.catch((err) => onError?.(err));
	};
	return {
		/** A change was made: wake once Undo has passed (or, for a new event that goes at once, `ms`). A
		    run of changes wakes once, after the last. */
		soon(ms = SEND_AFTER_MS + 1_000) {
			if (apple) later(ms);
		},
	};
}
