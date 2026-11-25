import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Passkey } from '../../lib/api';
import { ago } from '../../lib/dates';
import { notChosen, passkeysWork, prepareSave } from '../../lib/passkeys';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Button } from '../ui/Button';
import s from '../account/styles/Account.module.css';
import panel from './styles/Settings.module.css';

/** "iCloud Keychain · iPhone · Safari": who keeps it and where it was saved. */
const named = (p: Passkey) => [p.provider, p.device].filter(Boolean).join(' · ') || 'Passkey';

/**
 * Settings → Users, on the website: your passkeys (Face ID, Touch ID or a screen lock instead of a
 * code), each with where it was saved and when it was last used; save one on this device, or remove one.
 */
export default function Passkeys() {
	const qc = useQueryClient();
	const works = passkeysWork();
	const list = useQuery({ queryKey: ['passkeys'], queryFn: api.passkeys, enabled: works, retry: false });
	// Ready before the tap (Safari only shows its sheet straight from one); again after each use.
	const [save, setSave] = useState<(() => Promise<Passkey>) | null>(null);
	const [ready, setReady] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [removing, setRemoving] = useState<Passkey | null>(null);
	useEffect(() => {
		if (!works || !list.isSuccess) return;
		let live = true;
		prepareSave().then(
			(go) => live && setSave(() => go),
			() => {},
		);
		return () => {
			live = false;
		};
	}, [works, list.isSuccess, ready]);
	const remove = useMutation({
		mutationFn: api.removePasskey,
		onSettled: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
	});

	// Off (the phone app, an old browser, or passkeys not on this server).
	if (!works || !list.isSuccess) return null;
	return (
		<>
			<h3 className={s.subhead}>Passkeys</h3>
			<p className={s.hint}>Sign in with Face ID, Touch ID or your screen lock instead of an emailed code.</p>
			{list.data.length > 0 && (
				<ul className={panel.devices}>
					{list.data.map((p) => (
						<li key={p.id}>
							<span>{named(p)}</span>
							<span className={panel.deviceSeen}>{p.lastUsed ? `used ${ago(p.lastUsed)}` : 'not used yet'}</span>
							<Button variant="link" size="sm" onClick={() => setRemoving(p)}>
								Remove
							</Button>
						</li>
					))}
				</ul>
			)}
			<Button
				size="sm"
				style={{ alignSelf: 'flex-start' }}
				disabled={!save}
				onClick={() => {
					if (!save) return;
					setError(null);
					setSave(null);
					save()
						.then(
							() => qc.invalidateQueries({ queryKey: ['passkeys'] }),
							(e: Error) => !notChosen(e) && setError(e.message),
						)
						.finally(() => setReady((n) => n + 1));
				}}
			>
				Save a passkey on this device
			</Button>
			{error && <p className={s.error}>{error}</p>}
			{removing && (
				<ConfirmDialog
					title={`Remove ${named(removing)}?`}
					confirmLabel="Remove"
					onCancel={() => setRemoving(null)}
					onConfirm={() => {
						remove.mutate(removing.id);
						setRemoving(null);
					}}
				>
					It won't sign in to Sprig any more. To tidy up, also delete it from the device's passwords.
				</ConfirmDialog>
			)}
		</>
	);
}
