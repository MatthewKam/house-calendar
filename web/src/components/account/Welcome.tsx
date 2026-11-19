import { useState, type FormEvent } from 'react';
import { api, type AuthStatus, type SignedIn } from '../../lib/api';
import { pendingJoin } from '../../lib/joinCode';
import { startSetup } from '../../lib/setup';
import { isApp } from '../../lib/native';
import JoinForm from './JoinForm';
import s from './Account.module.css';
import { familyName, firstName } from '../../lib/people';

/**
 * Signed in, but in no household yet: start one with just your name (filled in from Apple when it gave one),
 * named for you ("The Kam family", changed here or later in Settings), or join one with a code.
 */
export default function Welcome({ status, onDone }: { status: SignedIn; onDone: (s: AuthStatus) => void }) {
	// An email sign-up's name is only the start of the address (server/hosted/signIn.ts): asked for, not used.
	const given = status.user && status.user.name !== status.user.email?.split('@')[0] ? status.user.name : '';
	const [yourName, setYourName] = useState(given);
	// The household's name follows yours until it's changed by hand.
	const [name, setName] = useState<string | null>(null);
	const [naming, setNaming] = useState(false);
	// An invite link opens straight to the code.
	const [joining, setJoining] = useState(!!pendingJoin());
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const household = (name ?? familyName(yourName)).trim();

	async function create(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const st = await api.createHousehold({ name: household, yourName: yourName.trim() });
			// The setup steps (Setup.tsx) come next, on this device.
			if (st.signedIn && st.household) startSetup(st.household.id);
			onDone(st);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className={s.screen}>
			<div className={s.column}>
				<img src="/wordmark.svg" alt="Sprig" className={s.wordmark} />
				<h1 className={s.title}>Hi{given ? `, ${firstName(given)}` : ''}</h1>
				{joining ? (
					<>
						<p className={s.lead}>Type the code your family sent you.</p>
						<JoinForm
							signedIn
							onJoined={(st) => {
								// A parent who joins on their phone shares its calendars next (Setup's calendar step).
								if (isApp && st.signedIn && st.household && st.role === 'guardian')
									startSetup(st.household.id, 'joined');
								onDone(st);
							}}
						/>
						<button className={s.link} onClick={() => setJoining(false)}>
							Start a new family instead
						</button>
					</>
				) : (
					<>
						<p className={s.lead}>Let's set up your family.</p>
						<form className={s.card} onSubmit={create}>
							<input
								className={s.input}
								placeholder="Your name"
								aria-label="Your name"
								autoComplete="name"
								value={yourName}
								onChange={(e) => setYourName(e.target.value)}
								maxLength={40}
								autoFocus={!yourName}
							/>
							{naming ? (
								<input
									className={s.input}
									placeholder="Family name, e.g. The Kims"
									aria-label="Family name"
									value={name ?? familyName(yourName)}
									onChange={(e) => setName(e.target.value)}
									maxLength={40}
									autoFocus
								/>
							) : (
								household && (
									<p className={s.hint}>
										Your family: <strong>{household}</strong>{' '}
										<button type="button" className={s.inlineLink} onClick={() => setNaming(true)}>
											Change
										</button>
									</p>
								)
							)}
							{error && <p className={s.error}>{error}</p>}
							<button className={s.primary} disabled={busy || !household || !yourName.trim()}>
								Start
							</button>
						</form>
						<button className={s.link} onClick={() => setJoining(true)}>
							Have a code from your family?
						</button>
					</>
				)}
				<button className={s.link} onClick={() => void api.signOut().then(() => onDone({ signedIn: false }))}>
					Sign out{status.user?.email ? ` (${status.user.email})` : ''}
				</button>
			</div>
		</main>
	);
}
