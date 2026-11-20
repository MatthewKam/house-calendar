import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	askPhoneCalendars,
	isApp,
	phoneCalendarAccess,
	phoneCalendarList,
	phoneCalendarsShared,
	sharePhoneCalendars,
	stopPhoneCalendars,
	type PhoneCalendarChoice,
} from '../../lib/native';
import { api } from '../../lib/api';
import { keys, useAuthStatus } from '../../lib/queries';
import { firstName } from '../../lib/people';
import { ago } from '../../lib/dates';
import type { Member } from '../../lib/types';
import s from '../account/Account.module.css';
import panel from './Settings.module.css';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';

type Stage =
	| { at: 'loading' }
	| { at: 'start' }
	| { at: 'denied' }
	| { at: 'pick'; list: PhoneCalendarChoice[]; picked: Set<string> }
	| { at: 'shared'; ids: string[]; events?: number };

/**
 * This phone's own calendars, shared with the family in a tap: no Apple ID or password, the iPhone just asks
 * "Allow access?". The app sends them whenever Sprig opens, and in the background when iOS allows
 * (ios/App/App/PhoneCalendars.swift). Only in the iPhone app; `onShared` tells Setup it's done.
 */
export default function PhoneCalendars({ onShared }: { onShared?: () => void }) {
	const qc = useQueryClient();
	const me = useAuthStatus().data;
	const [stage, setStage] = useState<Stage>({ at: 'loading' });
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isApp) return;
		void (async () => {
			const shared = await phoneCalendarsShared();
			if (shared) return setStage({ at: 'shared', ids: shared.calendarIds });
			setStage({ at: (await phoneCalendarAccess()) === 'denied' ? 'denied' : 'start' });
		})().catch(() => setStage({ at: 'start' }));
	}, []);
	if (!isApp) return null;

	const run = async (work: () => Promise<void>) => {
		setBusy(true);
		setError(null);
		try {
			await work();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	// Asks, then lists the phone's calendars, all picked to start with (or just the ones shared now).
	const pick = (ids?: string[]) =>
		run(async () => {
			if (!(await askPhoneCalendars())) return setStage({ at: 'denied' });
			const list = await phoneCalendarList();
			setStage({ at: 'pick', list, picked: new Set(ids ?? list.map((c) => c.id)) });
		});

	const share = (ids: string[]) =>
		run(async () => {
			const who = me?.signedIn && me.me ? `${firstName(me.me.name)}'s ` : '';
			const device = /iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone';
			const { events } = await sharePhoneCalendars(ids, `${who}${device}`);
			setStage({ at: 'shared', ids, events });
			void qc.invalidateQueries({ queryKey: keys.calendars });
			void qc.invalidateQueries({ queryKey: ['phones'] });
			void qc.invalidateQueries({ queryKey: keys.events });
			onShared?.();
		});

	const stop = () =>
		run(async () => {
			const shared = await phoneCalendarsShared();
			await stopPhoneCalendars();
			if (shared) await api.removePhone(shared.phone);
			setStage({ at: 'start' });
			void qc.invalidateQueries({ queryKey: keys.calendars });
			void qc.invalidateQueries({ queryKey: ['phones'] });
			void qc.invalidateQueries({ queryKey: keys.events });
		});

	return (
		<section className={panel.bare}>
			{stage.at === 'start' && (
				<>
					<Button variant="primary" disabled={busy} onClick={() => void pick()}>
						Use this {/iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone'}'s calendars
					</Button>
					<p className={s.hint}>No password: your phone asks if Sprig may see them, and you pick which to share.</p>
				</>
			)}
			{stage.at === 'denied' && (
				<p className={s.hint}>
					Sprig isn't allowed to see this phone's calendars. To share them, open the iPhone's Settings → Apps → Sprig →
					Calendars and choose Full Access, then come back here.
				</p>
			)}
			{stage.at === 'pick' && (
				<div className={s.card}>
					<h2>Which calendars?</h2>
					<p className={s.hint}>Everyone in the family sees the events in these.</p>
					<div className={s.choices}>
						{stage.list.map((c) => (
							<Chip
								key={c.id}

								pressed={stage.picked.has(c.id)}
								onClick={() => {
									const picked = new Set(stage.picked);
									if (!picked.delete(c.id)) picked.add(c.id);
									setStage({ ...stage, picked });
								}}
							>
								{c.name}
								{c.account && <span className={s.choiceNote}> · {c.account}</span>}
							</Chip>
						))}
					</div>
					<Button
						variant="primary"

						disabled={busy || stage.picked.size === 0}
						onClick={() => void share([...stage.picked])}
					>
						{busy ? 'Sharing…' : `Share ${stage.picked.size} ${stage.picked.size === 1 ? 'calendar' : 'calendars'}`}
					</Button>
				</div>
			)}
			{stage.at === 'shared' && (
				<>
					<p className={s.hint}>
						✓ Sharing {stage.ids.length} {stage.ids.length === 1 ? 'calendar' : 'calendars'} from this phone
						{stage.events !== undefined ? `, ${stage.events} events` : ''}. They update when Sprig opens, and now and
						then in the background.
					</p>
					{!onShared && (
						<div className={s.actions}>
							<Button variant="link" size="sm" disabled={busy} onClick={() => void pick(stage.ids)}>
								Change calendars
							</Button>
							<Button variant="link" size="sm" disabled={busy} onClick={() => void stop()}>
								Stop sharing
							</Button>
						</div>
					)}
				</>
			)}
			{error && <p className={s.error}>{error}</p>}
		</section>
	);
}

/** The family's phones sharing their calendars, and when each last sent them. Shown everywhere, the web too. */
export function SharingPhones({ members }: { members: Member[] }) {
	const phones = useQuery({ queryKey: ['phones'], queryFn: api.phones, refetchInterval: 60_000 }).data ?? [];
	if (phones.length === 0) return null;
	return (
		<ul className={s.people}>
			{phones.map((p) => (
				<li key={p.id} className={s.person}>
					<span
						className={s.dot}
						style={{ background: members.find((m) => m.id === p.memberId)?.color ?? 'var(--line)' }}
					/>
					<span className={s.who}>
						<span>{p.name}</span>
						<span className={s.how}>
							{p.calendars} {p.calendars === 1 ? 'calendar' : 'calendars'}, updated {ago(p.lastSync)}
						</span>
					</span>
				</li>
			))}
		</ul>
	);
}
