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
 * yet: the list, and Sprig emails it with a code, typed in here to give consent; a second email
 * confirms it. Given: the list folds away, and consent can be taken back (the children's devices are signed
 * out, and no child can be added, until a guardian gives it again). Only guardians on their own account see it.
 */
/** The full notice: the site's privacy page, outside the app (a new tab; in the app, a Safari sheet). */
const NOTICE = SITE_PAGE('/privacy', '#children');

/** One block of the list: its heading and what's in it. */
function Block({ title, why, items, tone }: { title: string; why?: string; items: string[]; tone?: 'never' }) {
	return (
		<div className={`${s.keptBlock} ${tone === 'never' ? s.keptNever : ''}`}>
			<h4 className={s.keptTitle}>{title}</h4>
			{why && <p className={s.keptWhy}>{why}</p>}
			<ul className={s.keptList}>
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</div>
	);
}

/** Exactly what's stored about a child, what never is, and how it's used: always in view. */
function WhatWeStore() {
	return (
		<>
			<h3 className={s.keptHeading}>What does Sprig need to know about my child?</h3>
			<p className={s.hint}>Exactly this, and only to run Sprig for your family:</p>
			<div className={s.kept}>
				{CHILD_DATA.map((g) => (
					<Block key={g.title} title={g.title} why={g.why} items={g.items} />
				))}
			</div>
			<div className={s.kept}>
				<Block title="Never stored" items={CHILD_NOT_KEPT} tone="never" />
				<Block title="How it's used" items={CHILD_USE} />
			</div>
			<p className={s.hint}>
				<a href={NOTICE} target="_blank" rel="noopener noreferrer">
					The full privacy notice
				</a>
			</p>
		</>
	);
}

export default function ChildConsent({ hasChildren }: { hasChildren: boolean }) {
	const auth = useAuthStatus().data;
	const qc = useQueryClient();
	const household = auth?.signedIn ? auth.household : null;
	const given = !!household?.childConsent;
	// "November 27, 2026 (alex@example.com)": when, and from whose email.
	const givenOn = household?.childConsentAt
		? new Date(household.childConsentAt).toLocaleDateString(undefined, { dateStyle: 'long' })
		: null;
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
					<p className={s.consentLead}>
						✓ <strong>You said yes</strong>
						{givenOn && ` on ${givenOn}`}
						{household?.childConsentBy && ` (${household.childConsentBy})`}
					</p>
					<WhatWeStore />
					<p className={s.hint}>
						<strong>Changed your mind?</strong> Taking back consent signs your children's devices out until a parent
						says yes again. To delete everything about a child, tap them above and choose Remove.
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
					<p className={s.consentLead}>
						<strong>
							{hasChildren
								? "Sprig needs a parent's OK for your children."
								: "Before you add a child, Sprig needs a parent's OK."}
						</strong>
					</p>
					<p className={s.hint}>Read what Sprig stores below. We'll email you a code to make sure it's you.</p>
					<WhatWeStore />
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
								Yes, I agree
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
