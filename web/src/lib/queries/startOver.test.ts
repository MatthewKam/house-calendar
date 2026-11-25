import { describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { startOver } from './family';
import { keys } from './shared';

// Signing out: the screen watching the sign-in status (AuthGate) must hear that it's now "signed out".
// (Wiping every query first, qc.clear(), left it watching the old status, so the app stayed on screen.)
describe('starting over as someone else', () => {
	const watch = (qc: QueryClient) => {
		const seen = new QueryObserver(qc, { queryKey: keys.auth, queryFn: () => new Promise(() => {}), enabled: false });
		const stop = seen.subscribe(() => {});
		return { now: () => seen.getCurrentResult().data, stop };
	};

	it("tells what's watching the sign-in status", () => {
		const qc = new QueryClient();
		qc.setQueryData(keys.auth, { signedIn: true });
		qc.setQueryData(keys.members, ['Pat']);
		const gate = watch(qc);
		startOver(qc, { signedIn: false });
		expect(gate.now()).toEqual({ signedIn: false });
		expect(qc.getQueryData(keys.members)).toBeUndefined();
		gate.stop();
	});
});
