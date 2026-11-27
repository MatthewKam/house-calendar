import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, problemText } from '../../lib/api';
import { keys, useAuthStatus } from '../../lib/queries';
import { SITE_PAGE } from '../../lib/native';
import { CHILD_DATA, CHILD_NOT_KEPT, CHILD_USE } from '../../../../shared/childPrivacy';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import s from './styles/Settings.module.css';

/**
 * Children's privacy (Settings, Family): exactly what Sprig keeps about a child (shared/childPrivacy.ts, the
 * same words as the consent email and the privacy page), and a guardian's consent for it (COPPA). Not given
 * yet: the list is open, and Sprig emails it with a code, typed in here to give consent; a second email
 * confirms it. Given: the list folds away, and consent can be taken back (the children's devices are signed
 * out, and no child can be added, until a guardian gives it again). Only guardians on their own account see it.
 */
/** The full notice: the site's privacy page, outside the app (a new tab; in the app, a Safari sheet). */
const NOTICE = SITE_PAGE('/privacy', '#children');

/** Exactly what's kept about a child, what never is, and how it's used. */
function WhatWeKeep() {
	return (
		<div className={s.kept}>
			{CHILD_DATA.map((g) => (
				<div key={g.title}>
					<h4 className={s.keptTitle}>{g.title}</h4>
					<ul className={s.keptList}>
						{g.items.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
			))}
			<div>
				<h4 className={s.keptTitle}>Never kept</h4>
				<ul className={s.keptList}>
					{CHILD_NOT_KEPT.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</div>
			<div>
				<h4 className={s.keptTitle}>How it's used</h4>
				<ul className={s.keptList}>
					{CHILD_USE.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</div>
			<p className={s.hint}>
				<a href={NOTICE} target="_blank" rel="noopener noreferrer">
					The full privacy notice
				</a>
			</p>
		</div>
	);
}

export default function ChildConsent({ hasChildren }: { hasChildren: boolean }) {
	const auth = useAuthStatus().data;
	const qc = useQueryClient();
	const given = auth?.signedIn ? !!auth.household?.childConsent : false;
	// The address the code went to, once asked for; the code being typed.
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [code, setCode] = useState('');
	const [problem, setProblem] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	// Taking it back is two taps.
	const [sure, setSure] = useState(false);

	async function run<T>(fn: () => Promise<T>, done: (r: T) => void) {
		setBusy(true);
		setProblem(null);
		try {
			done(await fn());
		} catch (err) {
			setProblem(problemText(err));
		} finally {
			setBusy(false);
		}
	}
	const ask = () => run(api.childConsentStart, (r) => setSentTo(r.sentTo));
	function confirm(e: FormEvent) {
		e.preventDefault();
		void run(
			() => api.childConsentVerify(code),
			(status) => {
				qc.setQueryData(keys.auth, status);
				setSentTo(null);
				setCode('');
			},
		);
	}
	const takeBack = () =>
		run(api.childConsentTakeBack, (status) => {
			qc.setQueryData(keys.auth, status);
			setSure(false);
		});

	return (
		<section className={s.bare}>
			{given ? (
				<>
					<p className={s.hint}>
						✓ You've given consent, as their parent or guardian, for Sprig to keep what's below about your children, for
						your family.
					</p>
					<details className={s.keptFold}>
						<summary>What Sprig keeps about your children</summary>
						<WhatWeKeep />
					</details>
					<p className={s.hint}>
						Taking it back signs your children's devices out, and no child can be added, until a guardian gives it
						again. Removing a child (tap them above) deletes what we have about them.
					</p>
					<div className={s.row}>
						<Button
							variant={sure ? 'destructive' : 'danger'}
							disabled={busy}
							onClick={() => (sure ? takeBack() : setSure(true))}
						>
							{sure ? 'Tap again to take it back' : 'Take back consent'}
						</Button>
						{sure && <Button onClick={() => setSure(false)}>Cancel</Button>}
					</div>
				</>
			) : (
				<>
					<p className={s.hint}>
						{hasChildren
							? 'Sprig needs your consent, as their parent or guardian, for what it keeps about your children. '
							: 'Before you add a child, Sprig needs your consent, as their parent or guardian, for what it keeps about children. '}
						Here is exactly what that is. We'll email it to you too, with a code to type in here.
					</p>
					<WhatWeKeep />
					{sentTo ? (
						<form className={s.row} onSubmit={confirm}>
							<Input
								className={s.name}
								inputMode="numeric"
								autoComplete="one-time-code"
								placeholder="6-digit code"
								value={code}
								maxLength={12}
								autoFocus
								onChange={(e) => setCode(e.target.value)}
								aria-label={`The code emailed to ${sentTo}`}
							/>
							<Button variant="primary" type="submit" disabled={busy || code.replace(/\D/g, '').length < 6}>
								I give consent
							</Button>
						</form>
					) : (
						<div className={s.row}>
							<Button variant="primary" disabled={busy} onClick={ask}>
								Email me the code
							</Button>
						</div>
					)}
					{sentTo && (
						<p className={s.hint}>
							Sent to {sentTo}. It works for 10 minutes.{' '}
							<Button variant="link" size="sm" disabled={busy} onClick={ask}>
								Send another
							</Button>
						</p>
					)}
				</>
			)}
			{problem && (
				<p className={s.error} role="alert">
					{problem}
				</p>
			)}
		</section>
	);
}
