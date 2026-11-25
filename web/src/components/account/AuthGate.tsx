import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type AuthStatus } from '../../lib/api';
import { keys, startOver, useAuthStatus } from '../../lib/queries';
import DemoBar from './DemoBar';
import PinScreen from './PinScreen';
import Setup from './Setup';
import { finishSetup, setupPending } from '../../lib/setup';
import SignIn from './SignIn';
import Welcome from './Welcome';
import a from './styles/Account.module.css';

/**
 * Shows the app once this device is in a household; before that, signing in, then starting or
 * joining a household, and the setup steps on the device that started it. The wall also needs a guardian's
 * PIN to enter. If the device is signed out
 * later (from Settings, say), it goes back to the start.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
	const qc = useQueryClient();
	const status = useAuthStatus();
	// Bumped when the setup steps finish, so the app shows.
	const [, setSetupDone] = useState(0);
	useEffect(() => {
		const signedOut = () => void qc.invalidateQueries({ queryKey: keys.auth });
		window.addEventListener('household:signed-out', signedOut);
		return () => window.removeEventListener('household:signed-out', signedOut);
	}, [qc]);

	// Everything is fetched again now that this device may see something else.
	const update = (s: AuthStatus) => startOver(qc, s);

	// Checking who this is: Sprig's name, gently pulsing, so the first moment isn't a blank page.
	if (status.isPending) {
		return (
			<div className={a.screen} role="status" aria-label="Opening Sprig">
				<img src="/wordmark.svg" alt="" className={`${a.wordmark} ${a.opening}`} />
			</div>
		);
	}
	const s = status.data;
	// Can't reach the server: show what the app last had (it opens offline).
	if (!s) return <>{children}</>;
	if (!s.signedIn) return <SignIn onSignedIn={update} />;
	if (!s.household) return <Welcome status={s} onDone={update} />;
	const setup = s.parent ? setupPending(s.household.id) : null;
	if (setup) {
		return (
			<Setup
				status={s}
				kind={setup}
				onDone={() => {
					finishSetup();
					setSetupDone((n) => n + 1);
				}}
			/>
		);
	}
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
	return (
		<>
			{children}
			{s.demo && <DemoBar demo={s.demo} onEnded={() => update({ signedIn: false })} />}
		</>
	);
}
