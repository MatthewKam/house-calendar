import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthStatus } from '../../lib/api';
import { useAuthStatus } from '../../lib/queries';
import { ago } from '../../lib/dates';
import { joinLink } from '../../lib/joinCode';
import { Loading, Skeleton, SkeletonLines } from '../ui/Skeleton';
import Problem, { loadProblem } from '../ui/Problem';
import s from '../account/Account.module.css';
import panel from './Settings.module.css';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';

type Kind = 'guardian' | 'kid' | 'wall';
const ROLE = { guardian: 'Guardian', kid: 'Kid' };
const DEVICE = { user: '', device: " (kid's device)", wall: '' };
/** How someone with their own account signs in: their email, or Apple with it hidden. */
const signsInWith = (email: string | null) =>
	!email ? 'their own account' : email.endsWith('@privaterelay.appleid.com') ? 'Apple' : email;

/**
 * Settings: who's in the household and how they sign in, inviting a guardian, adding a kid's device
 * or the wall with a code, this guardian's PIN, and the devices signed in.
 */
export default function HouseholdAccess() {
	const qc = useQueryClient();
	const status = useAuthStatus().data;
	// The sign-in being removed, while that's asked.
	const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
	// The account holder handing their role to another guardian, while that's asked.
	const [handing, setHanding] = useState<{ id: string; name: string } | null>(null);
	// The account holder making a kid a guardian, or a guardian a co-holder (or not), while that's asked.
	const [changing, setChanging] = useState<{
		id: string;
		change: { role?: 'guardian'; coHolder?: boolean };
		title: string;
		label: string;
		body: string;
	} | null>(null);
	// The account holder clearing another guardian's forgotten PIN, while that's asked.
	const [clearing, setClearing] = useState<{ id: string; name: string } | null>(null);
	const householdQuery = useQuery({ queryKey: ['account', 'household'], queryFn: api.household });
	const data = householdQuery.data;
	const refresh = () => qc.invalidateQueries({ queryKey: ['account'] });
	const [issued, setIssued] = useState<{ code: string; expiresAt: string; what: string } | null>(null);
	const invite = useMutation({
		mutationFn: (b: { kind: Kind; memberId?: string; name?: string; what: string }) =>
			api.invite({ kind: b.kind, memberId: b.memberId, name: b.name }),
		onSuccess: (r, b) => {
			setIssued({ ...r, what: b.what });
			void refresh();
		},
	});
	const cancel = useMutation({ mutationFn: api.cancelInvite, onSettled: refresh });
	const remove = useMutation({ mutationFn: api.removeSignIn, onSettled: refresh });
	const signOut = useMutation({ mutationFn: api.signOutDevice, onSettled: refresh });
	const clearPin = useMutation({ mutationFn: api.clearPin, onSettled: refresh });
	const unlockDevice = useMutation({ mutationFn: api.unlockDevice, onSettled: refresh });
	const change = useMutation({
		mutationFn: (c: { id: string; change: { role?: 'guardian'; coHolder?: boolean } }) =>
			api.changeSignIn(c.id, c.change),
		onSettled: refresh,
	});
	const handOver = useMutation({
		mutationFn: api.setHolder,
		onSuccess: (st) => qc.setQueryData(['auth'], st),
		onSettled: refresh,
	});
	const [newName, setNewName] = useState('');
	const [newKind, setNewKind] = useState<Kind>('guardian');
	const me = status?.signedIn ? status : null;

	function inviteNew(e: FormEvent) {
		e.preventDefault();
		const name = newName.trim();
		if (!name) return;
		invite.mutate({ kind: newKind, name, what: newKind === 'guardian' ? `${name} (guardian)` : `${name}'s device` });
		setNewName('');
	}

	if (!me) return null;
	if (householdQuery.isError) {
		return (
			<Problem message={loadProblem('users', householdQuery.error)} onRetry={() => void householdQuery.refetch()} />
		);
	}
	// Loading who's in the household: rows in their shape.
	if (!data) {
		return (
			<Loading label="Loading users">
				<SkeletonLines count={2} />
				<Skeleton height="2.6rem" />
				<Skeleton height="2.6rem" />
			</Loading>
		);
	}
	return (
		<section className={panel.bare}>
			{issued && <Issued {...issued} onClose={() => setIssued(null)} />}
			{invite.isError && <p className={s.error}>{invite.error.message}</p>}

			<h3 className={s.subhead}>People</h3>
			<ul className={s.people}>
				{data.people.map((p) => (
					<li key={p.memberId} className={s.person}>
						<span className={s.dot} style={{ background: p.color }} />
						<span className={s.who}>
							<span>
								{p.name}
								{p.memberId === me.memberId && <strong> (you)</strong>}
							</span>
							<span className={s.how}>
								{p.role
									? `${p.holder ? 'Account holder' : p.coHolder ? 'Co-holder' : ROLE[p.role]} · ${p.account ? `signs in with ${signsInWith(p.email)}` : 'signs in on devices added by code'}${p.role === 'guardian' && !p.hasPin ? ' · no PIN yet' : ''}`
									: "Doesn't sign in"}
							</span>
						</span>
						<span className={s.actions}>
							{p.role !== 'guardian' && !p.account && (
								<Button
									variant="link"
									size="sm"

									onClick={() => invite.mutate({ kind: 'kid', memberId: p.memberId, what: `${p.name}'s device` })}
								>
									Add a device
								</Button>
							)}
							{!p.account && (
								<Button
									variant="link"
									size="sm"

									onClick={() =>
										invite.mutate({ kind: 'guardian', memberId: p.memberId, what: `${p.name} (guardian)` })
									}
								>
									Invite as guardian
								</Button>
							)}
							{me.holder && p.role === 'kid' && p.account && p.membershipId && (
								<Button
									variant="link"
									size="sm"

									onClick={() =>
										setChanging({
											id: p.membershipId!,
											change: { role: 'guardian' },
											title: `Make ${p.name} a guardian?`,
											label: 'Make guardian',
											body: "They'll manage the family like you do, and set a PIN of their own for the wall and kids' devices.",
										})
									}
								>
									Make guardian
								</Button>
							)}
							{me.holder && p.role === 'guardian' && !p.holder && p.memberId !== me.memberId && p.membershipId && (
								<Button
									variant="link"
									size="sm"

									onClick={() =>
										setChanging(
											p.coHolder
												? {
														id: p.membershipId!,
														change: { coHolder: false },
														title: `Stop sharing the account with ${p.name}?`,
														label: 'Stop sharing',
														body: "They stay a guardian, but new colors and other guardians' PINs go back to the account holder.",
													}
												: {
														id: p.membershipId!,
														change: { coHolder: true },
														title: `Make ${p.name} a co-holder?`,
														label: 'Make co-holder',
														body: "They'll do everything the account holder does: OK new colors, reset guardians' PINs, and keep the household if the holder deletes their account. The wall keeps the holder's accent color.",
													},
										)
									}
								>
									{p.coHolder ? 'Stop co-holder' : 'Make co-holder'}
								</Button>
							)}
							{me.holder && p.role === 'guardian' && p.hasPin && p.memberId !== me.memberId && p.membershipId && (
								<Button
									variant="link"
									size="sm"

									onClick={() => setClearing({ id: p.membershipId!, name: p.name })}
								>
									Reset PIN
								</Button>
							)}
							{me.holder && p.role === 'guardian' && !p.holder && p.membershipId && (
								<Button
									variant="link"
									size="sm"

									onClick={() => setHanding({ id: p.membershipId!, name: p.name })}
								>
									Make account holder
								</Button>
							)}
							{p.membershipId && p.memberId !== me.memberId && (
								<Button
									variant="link"
									size="sm"

									onClick={() => setRemoving({ id: p.membershipId!, name: p.name })}
								>
									Remove sign-in
								</Button>
							)}
						</span>
						{/* Your own PIN, under your name. */}
						{p.memberId === me.memberId && me.role === 'guardian' && me.kind === 'user' && (
							<div className={panel.myPin}>
								<MyPin hasPin={me.hasPin} onSaved={(st) => qc.setQueryData(['auth'], st)} />
							</div>
						)}
					</li>
				))}
			</ul>
			<p className={s.hint}>
				A code is for joining once. After that, anyone with their own account just signs in on each new phone or tablet,
				no code needed. Younger kids' devices each get a code. The account holder and co-holders OK new colors for
				people, and the wall wears the account holder's accent color.
			</p>
			{remove.isError && <p className={s.error}>{remove.error.message}</p>}
			{handOver.isError && <p className={s.error}>{handOver.error.message}</p>}
			{change.isError && <p className={s.error}>{change.error.message}</p>}
			{clearPin.isError && <p className={s.error}>{clearPin.error.message}</p>}

			<form className={s.row} onSubmit={inviteNew}>
				<Input
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
					placeholder="Someone new"
					aria-label="Name"
					maxLength={40}
				/>
				<Select
					value={newKind}
					onChange={(e) => setNewKind(e.target.value as Kind)}
					aria-label="As"
					style={{ flex: 'none' }}
				>
					<option value="guardian">Guardian</option>
					<option value="kid">Kid</option>
				</Select>
				<Button variant="primary" type="submit" disabled={!newName.trim() || invite.isPending}>
					Invite
				</Button>
			</form>

			<h3 className={s.subhead}>The wall</h3>
			<p className={s.hint}>
				Get a code, then type it on the wall's screen. The wall asks for a guardian's PIN to open, and again to change
				things.
			</p>
			<Button
				variant="link"
				size="sm"

				style={{ alignSelf: 'flex-start' }}
				disabled={me.guardianPins === 0}
				onClick={() => invite.mutate({ kind: 'wall', what: 'the wall' })}
			>
				Add a wall display
			</Button>
			{me.guardianPins === 0 && <p className={s.hint}>A guardian sets their PIN first.</p>}

			{data.invites.length > 0 && (
				<>
					<h3 className={s.subhead}>Codes not used yet</h3>
					<ul className={panel.devices}>
						{data.invites.map((i) => (
							<li key={i.id}>
								<span>{i.kind === 'wall' ? 'The wall' : `${i.for ?? 'Someone'} (${i.kind})`}</span>
								<span className={panel.deviceSeen}>
									until{' '}
									{new Date(i.expiresAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
								</span>
								<Button variant="link" size="sm" onClick={() => cancel.mutate(i.id)}>
									Cancel
								</Button>
							</li>
						))}
					</ul>
				</>
			)}

			<h3 className={s.subhead}>Signed-in devices</h3>
			<ul className={panel.devices}>
				{data.devices.map((d) => (
					<li key={d.id}>
						<span>
							{d.who ?? 'Someone'}
							{DEVICE[d.kind]} · {d.label}
							{d.thisDevice && <strong> (this one)</strong>}
						</span>
						<span className={panel.deviceSeen}>{ago(d.lastSeen)}</span>
						{d.locked && (
							<Button variant="link" size="sm" onClick={() => unlockDevice.mutate(d.id)}>
								Unlock (too many wrong PINs)
							</Button>
						)}
						{!d.thisDevice && (
							<Button variant="link" size="sm" onClick={() => signOut.mutate(d.id)}>
								Sign out
							</Button>
						)}
					</li>
				))}
			</ul>

			{removing && (
				<ConfirmDialog
					title={`Sign ${removing.name} out of this household?`}
					confirmLabel="Remove sign-in"
					onCancel={() => setRemoving(null)}
					onConfirm={() => {
						remove.mutate(removing.id);
						setRemoving(null);
					}}
				>
					They stay in the family.
				</ConfirmDialog>
			)}
			{changing && (
				<ConfirmDialog
					title={changing.title}
					confirmLabel={changing.label}
					onCancel={() => setChanging(null)}
					onConfirm={() => {
						change.mutate(changing);
						setChanging(null);
					}}
				>
					{changing.body}
				</ConfirmDialog>
			)}
			{clearing && (
				<ConfirmDialog
					title={`Reset ${clearing.name}'s PIN?`}
					confirmLabel="Reset PIN"
					onCancel={() => setClearing(null)}
					onConfirm={() => {
						clearPin.mutate(clearing.id);
						setClearing(null);
					}}
				>
					Their PIN stops working. They set a new one in Settings on their own phone; any device locked by wrong tries
					can try again.
				</ConfirmDialog>
			)}
			{handing && (
				<ConfirmDialog
					title={`Make ${handing.name} the account holder?`}
					confirmLabel="Hand it over"
					onCancel={() => setHanding(null)}
					onConfirm={() => {
						handOver.mutate(handing.id);
						setHanding(null);
					}}
				>
					The wall will wear their accent color, and the household is theirs to delete. You stay a guardian.
				</ConfirmDialog>
			)}
		</section>
	);
}

/** A new code, big enough to read across the room, with a link to send. */
export function Issued({
	code,
	expiresAt,
	what,
	onClose,
}: {
	code: string;
	expiresAt: string;
	what: string;
	onClose: () => void;
}) {
	const link = joinLink(code);
	const [copied, setCopied] = useState(false);
	const share = async () => {
		if (navigator.share)
			await navigator.share({ title: 'Join our household', text: `Your code is ${code}`, url: link }).catch(() => {});
		else
			await navigator.clipboard.writeText(link).then(
				() => setCopied(true),
				() => {},
			);
	};
	return (
		<div className={s.issued}>
			<span className={s.hint}>Code for {what}</span>
			<span className={s.bigCode}>{code}</span>
			<span className={s.hint}>
				Works once, until{' '}
				{new Date(expiresAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
			</span>
			<div className={s.row} style={{ justifyContent: 'center' }}>
				<Button variant="link" size="sm" onClick={() => void share()}>
					{copied ? 'Link copied' : 'Send the link'}
				</Button>
				<Button variant="link" size="sm" onClick={onClose}>
					Done
				</Button>
			</div>
		</div>
	);
}

/** This guardian's PIN: opens the wall and unlocks it (or a kid's device) for changes. */
function MyPin({ hasPin, onSaved }: { hasPin: boolean; onSaved: (s: AuthStatus) => void }) {
	// Showing the PIN set; changing it (current PIN, then the new one twice); or, forgotten, a code by email.
	const [mode, setMode] = useState<'set' | 'change' | 'forgot'>(hasPin ? 'set' : 'change');
	const [current, setCurrent] = useState('');
	const [code, setCode] = useState('');
	const [pin, setPin] = useState('');
	const [again, setAgain] = useState('');
	const [sentTo, setSentTo] = useState<string | null>(null);
	const done = (st: AuthStatus) => {
		onSaved(st);
		setMode('set');
		setCurrent('');
		setCode('');
		setPin('');
		setAgain('');
		setSentTo(null);
	};
	const save = useMutation({
		mutationFn: () => (mode === 'forgot' ? api.resetPin(code, pin) : api.setMyPin(pin, hasPin ? current : undefined)),
		onSuccess: done,
	});
	const forgot = useMutation({ mutationFn: api.forgotPin, onSuccess: (r) => setSentTo(r.sentTo) });
	const problem =
		mode === 'change' && hasPin && !current
			? 'Your current PIN first'
			: mode === 'forgot' && !/^\d{6}$/.test(code.replace(/\D/g, ''))
				? 'The 6-digit code from the email'
				: !/^\d{4,8}$/.test(pin)
					? '4 to 8 digits'
					: pin !== again
						? "The two don't match"
						: null;
	const cancel = () => {
		setMode('set');
		setCurrent('');
		setCode('');
		setPin('');
		setAgain('');
		setSentTo(null);
		save.reset();
		forgot.reset();
	};

	if (mode === 'set') {
		return (
			<p className={s.hint}>
				Your PIN is set: it opens the wall and unlocks changes there.{' '}
				<Button variant="link" size="sm" onClick={() => setMode('change')}>
					Change it
				</Button>
			</p>
		);
	}
	return (
		<form
			className={panel.pinForm}
			onSubmit={(e) => {
				e.preventDefault();
				if (!problem) save.mutate();
			}}
		>
			<p className={s.hint}>
				{mode === 'forgot'
					? sentTo
						? `A code is on its way to ${sentTo}. Type it here with your new PIN.`
						: "We'll email you a code, so you can set a new PIN without the old one."
					: "Your guardian PIN opens the wall, and unlocks changes there or on a kid's device."}
			</p>
			{mode === 'forgot' && !sentTo && (
				<Button variant="primary" disabled={forgot.isPending} onClick={() => forgot.mutate()}>
					Email me a code
				</Button>
			)}
			{mode === 'forgot' && forgot.isError && <p className={panel.pinError}>{forgot.error.message}</p>}
			{(mode === 'change' || sentTo) && (
				<>
					{mode === 'change' && hasPin && (
						<Input
							type="password"
							inputMode="numeric"
							autoComplete="current-password"
							placeholder="Current PIN"
							aria-label="Current PIN"
							value={current}
							onChange={(e) => setCurrent(e.target.value)}
							maxLength={8}
						/>
					)}
					{mode === 'forgot' && (
						<Input
							inputMode="numeric"
							autoComplete="one-time-code"
							placeholder="Code from the email"
							aria-label="Code from the email"
							value={code}
							onChange={(e) => setCode(e.target.value)}
							maxLength={7}
						/>
					)}
					<Input
						type="password"
						inputMode="numeric"
						autoComplete="new-password"
						placeholder="New PIN"
						aria-label="New PIN"
						value={pin}
						onChange={(e) => setPin(e.target.value)}
						maxLength={8}
					/>
					<Input
						type="password"
						inputMode="numeric"
						autoComplete="new-password"
						placeholder="Again"
						aria-label="New PIN again"
						value={again}
						onChange={(e) => setAgain(e.target.value)}
						maxLength={8}
					/>
					{(pin || current || code) && problem && <p className={panel.pinError}>{problem}</p>}
					{save.isError && <p className={panel.pinError}>{save.error.message}</p>}
				</>
			)}
			<div className={s.row}>
				{(mode === 'change' || sentTo) && (
					<Button variant="primary" type="submit" disabled={!!problem || save.isPending}>
						Save PIN
					</Button>
				)}
				{hasPin && mode === 'change' && (
					<Button
						variant="link"
						size="sm"

						onClick={() => {
							cancel();
							setMode('forgot');
						}}
					>
						Forgot PIN?
					</Button>
				)}
				{hasPin && (
					<Button variant="link" size="sm" onClick={cancel}>
						Cancel
					</Button>
				)}
			</div>
		</form>
	);
}
