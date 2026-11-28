import { useState, type MouseEvent } from 'react';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isApp } from './native';

// A little tap under the finger, the way iOS's own buttons and pickers feel. In the phone app it's the
// Taptic Engine (Capacitor's Haptics, which also follows the iPhone's own System Haptics switch); in a
// browser, a short buzz where one is allowed (Android; iPhones don't let web pages vibrate, computers
// can't). A few kinds, by what happened, so every screen feels the same:
//   tap      a button pressed
//   select   a tab, a switch, an option, or one more step along (an hour on the weather graph)
//   done     a thing ticked off (a task, a list item)
//   success  something to celebrate (stars, a jar filled)
//   warn     something taken away (delete)
// There's a switch for it, on this device (Settings → Appearance → Vibration).

export type Feel = 'tap' | 'select' | 'done' | 'success' | 'warn';

const KEY = 'sprig:haptics';

/** In a browser, how each feels: one short buzz, or a pattern (ms on, off, on…). */
const BUZZ: Record<Feel, number | number[]> = {
	tap: 10,
	select: 5,
	done: 20,
	success: [30, 60, 30, 60, 60],
	warn: [25, 50, 25],
};

/** Whether this device can feel anything: the phone app, or a browser that's allowed to vibrate. */
export const canFeel = () => isApp || (typeof navigator !== 'undefined' && 'vibrate' in navigator);

/** Where storage is blocked, the switch for this visit. */
let thisVisit: boolean | null = null;

/** On unless turned off on this device. */
export function hapticsOn() {
	if (thisVisit !== null) return thisVisit;
	try {
		return localStorage.getItem(KEY) !== 'off';
	} catch {
		return true;
	}
}

let selecting = false;

/** How many feels have been asked for: tapArea checks whether a press gave its own. */
let asked = 0;

/** Plays one feel, if this device can and its switch is on. Never throws: a missed tap is nothing. */
export function feel(kind: Feel) {
	asked++;
	if (!hapticsOn() || !canFeel()) return;
	if (!isApp) {
		try {
			navigator.vibrate(BUZZ[kind]);
		} catch {
			// Not allowed just now (no tap on the page yet): nothing.
		}
		return;
	}
	const run = async () => {
		switch (kind) {
			case 'tap':
				return Haptics.impact({ style: ImpactStyle.Light });
			case 'done':
				return Haptics.impact({ style: ImpactStyle.Medium });
			case 'select':
				// iOS's picker tick: ready once, then each change.
				if (!selecting) {
					await Haptics.selectionStart();
					selecting = true;
				}
				return Haptics.selectionChanged();
			case 'success':
				return Haptics.notification({ type: NotificationType.Success });
			case 'warn':
				return Haptics.notification({ type: NotificationType.Warning });
		}
	};
	run().catch(() => {});
}

/** This device's switch, and changing it (a tap to feel it when turned on). */
export function useHapticsSetting() {
	const [on, setOn] = useState(hapticsOn);
	const set = (next: boolean) => {
		try {
			if (next) localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, 'off');
		} catch {
			// Private browsing or storage blocked: just this visit.
			thisVisit = next;
		}
		setOn(next);
		if (next) feel('select');
	};
	return [on, set] as const;
}

/** What counts as pressable in a tapArea. */
const PRESSABLE = 'button, a[href], summary, [role="button"], [role="tab"], [role="radio"], [role="link"]';
let askedAtPress = 0;

/**
 * For a whole part of a page (Today, the event panel): a tap for anything pressable in it, unless what was
 * pressed gave its own feel (a tick for a tab, a firmer tap for a tick-off). Spread on the part's element.
 */
export const tapArea = {
	onClickCapture: () => {
		askedAtPress = asked;
	},
	onClick: (e: MouseEvent) => {
		if (asked === askedAtPress && (e.target as Element).closest?.(PRESSABLE)) feel('tap');
	},
};
