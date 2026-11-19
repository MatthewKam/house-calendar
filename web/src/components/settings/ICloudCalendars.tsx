import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStatus } from '../../lib/queries';
import { ago } from '../../lib/dates';
import type { Member } from '../../lib/types';
import s from '../account/Account.module.css';
import panel from './Settings.module.css';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * Settings → Calendars: each person's iCloud Calendar, connected with their Apple ID and an
 * app-specific password (their normal Apple password is never asked for). Events sync both ways.
 */
export default function ICloudCalendars({ members }: { members: Member[] }) {
	const qc = useQueryClient();
	const status = useAuthStatus().data;
	// The account being disconnected, while that's asked.
	const [disconnecting, setDisconnecting] = useState<{ id: string; account: string } | null>(null);
	const list = useQuery({ queryKey: ['connections'], queryFn: api.connections, refetchInterval: 30_000 }).data?.icloud;
	const [open, setOpen] = useState(false);
	const [appleId, setAppleId] = useState('');
	const [password, setPassword] = useState('');
	const refresh = () => {
		void qc.invalidateQueries({ queryKey: ['connections'] });
		void qc.invalidateQueries({ queryKey: ['calendars'] });
	};
	const connect = useMutation({
		mutationFn: api.connectICloud,
		onSuccess: () => {
			setOpen(false);
			setAppleId('');
			setPassword('');
		},
		onSettled: refresh,
	});
	const remove = useMutation({ mutationFn: api.removeConnection, onSettled: refresh });
	if (list === undefined || list === null) return null;
	// Connecting is a parent change: from a guardian's phone, or a wall or kid's device unlocked with a PIN.
	const canConnect = status?.signedIn ? status.parent : true;
	const mine = list.some((c) => c.memberId === (status?.signedIn ? status.memberId : null));

	return (
		<section className={panel.bare}>
			{list.length > 0 && (
				<ul className={s.people}>
					{list.map((c) => {
						const who = members.find((m) => m.id === c.memberId);
						return (
							<li key={c.id} className={s.person}>
								<span className={s.dot} style={{ background: who?.color ?? 'var(--line)' }} />
								<span className={s.who}>
									<span>{who ? `${who.name}'s iCloud Calendar` : 'iCloud Calendar'}</span>
									<span className={s.how}>
										{c.account} ·{' '}
										{c.lastError ? (
											<span className={s.error}>{c.lastError}</span>
										) : c.lastSuccess ? (
											`${c.calendars} calendars, synced ${ago(c.lastSuccess)}`
										) : (
											'Syncing…'
										)}
									</span>
								</span>
								<button type="button" className={panel.textLink} onClick={() => setDisconnecting(c)}>
									Disconnect
								</button>
							</li>
						);
					})}
				</ul>
			)}
			{remove.isError && <p className={s.error}>{remove.error.message}</p>}
			{!canConnect ? (
				<p className={s.hint}>A guardian connects iCloud Calendar from Settings on their phone.</p>
			) : !open ? (
				<button type="button" className={s.primary} style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
					{mine ? 'Connect another iCloud account' : 'Connect my iCloud Calendar'}
				</button>
			) : (
				<form
					className={s.card}
					onSubmit={(e) => {
						e.preventDefault();
						connect.mutate({ appleId, password });
					}}
				>
					<h2>Connect iCloud Calendar</h2>
					<ol className={s.hint} style={{ margin: 0, paddingLeft: '1.2rem' }}>
						<li>
							Open{' '}
							<a href="https://account.apple.com" target="_blank" rel="noreferrer">
								account.apple.com
							</a>{' '}
							and sign in.
						</li>
						<li>Under Sign-In and Security, choose App-Specific Passwords and make one called "Sprig".</li>
						<li>Type your Apple ID and that password here. Your normal Apple password is never used.</li>
					</ol>
					<input
						className={s.input}
						inputMode="email"
						autoCapitalize="none"
						placeholder="Apple ID"
						aria-label="Apple ID"
						autoComplete="username"
						value={appleId}
						onChange={(e) => setAppleId(e.target.value)}
						maxLength={200}
						required
					/>
					<input
						className={s.input}
						placeholder="xxxx-xxxx-xxxx-xxxx"
						aria-label="App-specific password"
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						maxLength={100}
						required
					/>
					{connect.isError && <p className={s.error}>{connect.error.message}</p>}
					<div className={s.actions}>
						<button
							type="submit"
							className={s.primary}
							disabled={connect.isPending || !appleId.trim() || !password.trim()}
						>
							{connect.isPending ? 'Checking…' : 'Connect'}
						</button>
						<button type="button" className={panel.textLink} onClick={() => setOpen(false)}>
							Cancel
						</button>
					</div>
					<p className={s.hint}>You can change iCloud events here too, and they update on everyone's phones.</p>
				</form>
			)}
			{disconnecting && (
				<ConfirmDialog
					title={`Disconnect ${disconnecting.account}?`}
					confirmLabel="Disconnect"
					onCancel={() => setDisconnecting(null)}
					onConfirm={() => {
						remove.mutate(disconnecting.id);
						setDisconnecting(null);
					}}
				>
					Its calendars leave the app.
				</ConfirmDialog>
			)}
		</section>
	);
}
