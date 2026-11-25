import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStatus } from '../../lib/queries';
import { deviceKeepsPasskeys, notChosen, prepareSave, takePasskeyOffer } from '../../lib/passkeys';
import ConfirmDialog from '../ui/ConfirmDialog';
import s from './styles/Account.module.css';

/** Whether this page load is right after signing in another way: worked out once (StrictMode runs things twice). */
let due: boolean | null = null;
const offerDue = () => (due ??= takePasskeyOffer());

/**
 * Right after signing in on the website with a code, Apple or Google: "Sign in with Face ID next
 * time?", once, when this device can keep a passkey and the person has none yet. Never on the demo,
 * a kid's device or the wall.
 */
export default function PasskeyOffer() {
	const qc = useQueryClient();
	const status = useAuthStatus().data;
	const [save, setSave] = useState<(() => Promise<unknown>) | null>(null);
	const [error, setError] = useState<string | null>(null);
	const own = !!status?.signedIn && status.kind === 'user' && !status.wallMode && !status.demo;

	useEffect(() => {
		if (!own || !offerDue()) return;
		let live = true;
		(async () => {
			if (!(await deviceKeepsPasskeys())) return;
			if ((await api.passkeys()).length) return;
			const go = await prepareSave();
			if (live) setSave(() => go);
		})().catch(() => {});
		return () => {
			live = false;
		};
	}, [own]);

	if (!save) return null;
	const close = () => {
		due = false;
		setSave(null);
	};
	return (
		<ConfirmDialog
			title="Sign in with Face ID next time?"
			confirmLabel="Save a passkey"
			cancelLabel="Not now"
			safe
			onCancel={close}
			onConfirm={() => {
				setError(null);
				save().then(
					() => {
						void qc.invalidateQueries({ queryKey: ['passkeys'] });
						close();
					},
					(e: Error) => {
						if (notChosen(e)) return close();
						setError(e.message);
						// Its one-time challenge is used up: ready another for trying again.
						prepareSave().then((go) => setSave(() => go), close);
					},
				);
			}}
		>
			Save a passkey on this device, and next time sign in with Face ID, Touch ID or your screen lock instead of waiting
			for a code. You can remove it in Settings → Users.
			{error && <p className={s.error}>{error}</p>}
		</ConfirmDialog>
	);
}
