/**
 * Sideways trackpad swipes, one step each (the week carousel's days). A trackpad sends a swipe as a run of
 * wheel events: speeding up while the fingers move, then its coasting, slowing down for a second or more
 * after they lift. One swipe moves one step, however long it coasts; the next swipe moves another even
 * while the last one is still coasting, as it speeds up again (or goes the other way).
 */

/** How far (px) a swipe goes to move a step. */
export const WHEEL_STEP = 60;
/** How long (ms) with no wheel before a swipe counts as over. */
export const WHEEL_QUIET = 150;
/** A new swipe during the coasting: its events this many times faster than the slowest since it slowed. */
const SPEED_UP = 3;
/** ...and at least this fast (px per event), so the coasting's jitter at its tail doesn't count. */
const MIN_SPEED_UP = 6;

export interface WheelSwipe {
	/** One wheel event's sideways move (px, + is to the right) at `t` (ms): -1 or 1 to step that way, else 0. */
	push(dx: number, t: number): -1 | 0 | 1;
}

export function wheelSwipe(): WheelSwipe {
	let total = 0; // how far this swipe has gone, until it moves a step
	let moved = false; // this swipe has moved its step: the rest is its coasting
	let way = 0; // the way it moved
	let peak = 0; // the fastest since it moved
	let low = Infinity; // the slowest since it started slowing down
	let last = -Infinity; // when the last event came
	const fresh = () => {
		total = 0;
		moved = false;
		peak = 0;
		low = Infinity;
	};
	return {
		push(dx, t) {
			if (t - last > WHEEL_QUIET) fresh();
			last = t;
			const speed = Math.abs(dx);
			if (moved) {
				// Coasting only slows down, the same way. Going the other way, or speeding up again after it
				// slowed, is a new swipe.
				const reversed = Math.sign(dx) === -way && speed >= MIN_SPEED_UP;
				const slowed = low < peak;
				const again = slowed && speed >= Math.max(low * SPEED_UP, MIN_SPEED_UP);
				if (reversed || again) fresh();
				else {
					if (speed >= peak && low === Infinity) peak = speed;
					else low = Math.min(low, speed);
					return 0;
				}
			}
			total += dx;
			if (Math.abs(total) < WHEEL_STEP) return 0;
			moved = true;
			way = Math.sign(total);
			peak = speed;
			low = Infinity;
			return way as -1 | 1;
		},
	};
}
