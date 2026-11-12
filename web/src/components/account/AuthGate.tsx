import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type AuthStatus } from '../../lib/api';
import { keys, useAuthStatus } from '../../lib/queries';
import PinScreen from './PinScreen';
import SignIn from './SignIn';
import Welcome from './Welcome';

/**
 * Shows the app once this device is in a household; before that, signing in, then starting or
 * joining a household. The wall also needs a guardian's PIN to enter. If the device is signed out
 * later (from Settings, say), it goes back to the start.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
	const qc = useQueryClient();
	const status = useAuthStatus();
	useEffect(() => {
		const signedOut = () => void qc.invalidateQueries({ queryKey: keys.auth });
		window.addEventListener('household:signed-out', signedOut);
		return () => window.removeEventListener('household:signed-out', signedOut);
	}, [qc]);

	// Everything is fetched again now that this device may see something else.
	const update = (s: AuthStatus) => {
		qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' && q.queryKey[0] !== 'account-config' });
		qc.setQueryData(['auth'], s);
	};

	if (status.isPending) return null;
	const s = status.data;
	// Can't reach the server: show what the app last had (it opens offline).
	if (!s) return <>{children}</>;
	if (!s.signedIn) return <SignIn onSignedIn={update} />;
	if (!s.household) return <Welcome status={s} onDone={update} />;
	if (!s.entered) {
		return (
			<PinScreen
				title={`Enter a guardian's PIN`}
				hint={`${s.household.name} · the family wall`}
				onSubmit={(pin) => api.enterWall(pin).then(update)}
				onDone={() => {}}
			/>
		);
	}
	return <>{children}</>;
}
