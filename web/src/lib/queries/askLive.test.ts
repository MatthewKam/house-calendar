import { afterEach, describe, expect, it, vi } from 'vitest';
import { askLive } from './shared';

// Asking the server again and again (events, lists while shopping together): each ask sends the last
// answer's stamp, a failed ask waits a moment and tries again, and leaving stops it.
describe('asking live', () => {
	afterEach(() => void vi.useRealTimers());

	it('sends back the last stamp, tries again a moment after a failure, and stops when told', async () => {
		vi.useFakeTimers();
		const stop = new AbortController();
		const sent: (string | null)[] = [];
		const heard: string[] = [];
		const answers = ['a', new Error('offline'), 'b', 'c'];
		const ask = async (stamp: string | null) => {
			sent.push(stamp);
			const next = answers.shift();
			if (next instanceof Error) throw next;
			if (next === undefined) return new Promise<never>(() => {});
			return { stamp: next };
		};
		const done = askLive(stop.signal, ask, (live) => {
			heard.push(live.stamp);
			if (live.stamp === 'c') stop.abort();
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(heard).toEqual(['a']);
		// The failed ask: nothing more until the pause is over.
		await vi.advanceTimersByTimeAsync(2_900);
		expect(sent).toEqual([null, 'a']);
		await vi.advanceTimersByTimeAsync(200);
		await done;
		expect(sent).toEqual([null, 'a', 'a', 'b']);
		expect(heard).toEqual(['a', 'b', 'c']);
	});
});
