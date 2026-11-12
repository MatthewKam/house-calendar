import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type AuthStatus, type SignedIn } from '../../lib/api';
import Avatar from './Avatar';
import ConfirmDialog from '../ui/ConfirmDialog';
import s from '../account/Account.module.css';
import sheet from '../ui/Sheet.module.css';

/** "Nov 12, 10:04 AM". */
const when = (iso: string) =>
	new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Another household or signed out: nothing on screen belongs any more, so it all loads again. */
function useRestart(onClose: () => void) {
	const qc = useQueryClient();
	return (next: AuthStatus) => {
		qc.clear();
		qc.setQueryData(['auth'], next);
		onClose();
	};
}

/**
 * The top of Settings: who this device is signed in as (the wall: the wall), their email, and when this
 * device signed in; with more than one household, which one it's in.
 */
export function SignedInAs({ status, onClose }: { status: SignedIn; onClose: () => void }) {
	const restart = useRestart(onClose);
	// Not on a shared screen: whose account the wall is on.
	const email = status.role === 'wall' ? null : status.user?.email;
	return (
		<div className={s.person}>
			<Avatar status={status} big />
			<span className={s.who}>
				<strong>
					{status.me?.name ?? 'The wall'}
					{status.household && ` · ${status.household.name}`}
				</strong>
				{email && <span className={s.how}>{email}</span>}
				<span className={s.how}>
					{status.kind === 'user' ? 'Signed in' : 'Added'} on this device {when(status.signedInAt)}
				</span>
			</span>
			{status.households.length > 1 && (
				<select
					className={s.input}
					value={status.household?.id}
					aria-label="Household"
					onChange={(e) => void api.useHousehold(e.target.value).then(restart)}
				>
					{status.households.map((h) => (
						<option key={h.id} value={h.id}>
							{h.name}
						</option>
					))}
				</select>
			)}
		</div>
	);
}

/**
 * The bottom of Settings: sign this device out, asked first (getting back in takes a sign-in, or a new
 * code for a kid's device). The wall added with a code just locks, back to the PIN screen.
 */
export function SignOut({ status, onClose }: { status: SignedIn; onClose: () => void }) {
	const restart = useRestart(onClose);
	const [asking, setAsking] = useState(false);
	if (status.kind === 'wall') {
		return (
			<button type="button" className={sheet.secondary} onClick={() => void api.lockWall().then(restart)}>
				Lock the wall
			</button>
		);
	}
	return (
		<>
			<button type="button" className={sheet.danger} onClick={() => setAsking(true)}>
				Sign out
			</button>
			{asking && (
				<ConfirmDialog
					title="Sign out of this device?"
					confirmLabel="Sign out"
					onCancel={() => setAsking(false)}
					onConfirm={() => {
						setAsking(false);
						void api.signOut().then(() => restart({ signedIn: false }));
					}}
				>
					{status.kind === 'device'
						? "Getting it back takes a new kid's code from a guardian's Settings."
						: `Getting back in takes signing in again${status.wallMode ? ', and wall mode ends' : ''}.`}
				</ConfirmDialog>
			)}
		</>
	);
}
