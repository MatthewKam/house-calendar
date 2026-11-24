import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { isApp, onSheetClosed, openInSheet } from '../../lib/native';
import { useAuthStatus } from '../../lib/queries';
import { ago } from '../../lib/dates';
import type { Member } from '../../lib/types';
import s from '../account/styles/Account.module.css';
import panel from './styles/Settings.module.css';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Button } from '../ui/Button';

/**
 * Settings → Calendars: each person's Google Calendar. Connecting is from your own phone (Google
 * asks you to allow it, then brings you back); the wall shows who's connected. The phone app does it in a
 * Safari sheet, with a one-time link (server/hosted/google.ts).
 */
export default function GoogleCalendars({ members }: { members: Member[] }) {
	const qc = useQueryClient();
	const status = useAuthStatus().data;
	// The account being disconnected, while that's asked.
	const [disconnecting, setDisconnecting] = useState<{ id: string; account: string } | null>(null);
	const list = useQuery({ queryKey: ['connections'], queryFn: api.connections, refetchInterval: 30_000 }).data?.google;
	const remove = useMutation({
		mutationFn: api.removeConnection,
		onSettled: () => {
			void qc.invalidateQueries({ queryKey: ['connections'] });
			void qc.invalidateQueries({ queryKey: ['calendars'] });
		},
	});
	const [linkError, setLinkError] = useState<string | null>(null);
	// Back from the sheet: show what was connected.
	useEffect(
		() =>
			isApp
				? onSheetClosed(() => {
						void qc.invalidateQueries({ queryKey: ['connections'] });
						void qc.invalidateQueries({ queryKey: ['calendars'] });
					})
				: undefined,
		[qc],
	);
	// The server has no Google client set up.
	if (list === undefined || list === null) return null;
	const ownAccount = status?.signedIn && status.kind === 'user' && !status.wallMode;
	const myId = status?.signedIn ? status.memberId : null;
	const mine = list.some((c) => c.memberId === myId);
	// Mine, but connected before Sprig could change events: connecting it again (same account) fixes it.
	const mineReadOnly = list.some((c) => c.memberId === myId && c.readOnly);

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
									<span>{who?.name ?? 'Someone'}'s Google Calendar</span>
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
									{c.readOnly && (
										<span className={s.how}>
											Read only: connected before Sprig could make changes. Connect it again to change events here.
										</span>
									)}
								</span>
								<Button variant="link" size="sm" onClick={() => setDisconnecting(c)}>
									Disconnect
								</Button>
							</li>
						);
					})}
				</ul>
			)}
			{remove.isError && <p className={s.error}>{remove.error.message}</p>}
			{linkError && <p className={s.error}>{linkError}</p>}
			{ownAccount && isApp ? (
				<Button
					variant="primary"

					style={{ alignSelf: 'flex-start' }}
					onClick={() => {
						setLinkError(null);
						api.googleLink().then(
							(r) => openInSheet(r.url),
							(e: Error) => setLinkError(e.message),
						);
					}}
				>
					{mineReadOnly
						? 'Connect again to make changes'
						: mine
							? 'Connect another Google account'
							: 'Connect my Google Calendar'}
				</Button>
			) : ownAccount ? (
				// A full page visit: Google's pages, then back to the app.
				<a
					className={s.primary}
					href="/api/account/google/connect"
					style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
				>
					{mineReadOnly
						? 'Connect again to make changes'
						: mine
							? 'Connect another Google account'
							: 'Connect my Google Calendar'}
				</a>
			) : (
				<p className={s.hint}>Each person connects their own Google Calendar from Settings on their phone.</p>
			)}
			<p className={s.hint}>Google events show here, and changes made here go back to Google Calendar.</p>
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
