import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AuthStatus } from "../lib/api";
import { useAuthStatus } from "../lib/queries";
import { ago } from "../lib/dates";
import s from "../styles/Account.module.css";
import panel from "../styles/MembersPanel.module.css";
import ConfirmDialog from "./ConfirmDialog";

type Kind = "guardian" | "kid" | "wall";
const ROLE = { guardian: "Guardian", kid: "Kid" };
const DEVICE = { user: "", device: " (kid's device)", wall: "" };

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
	const data = useQuery({ queryKey: ["account", "household"], queryFn: api.household }).data;
	const refresh = () => qc.invalidateQueries({ queryKey: ["account"] });
	const [issued, setIssued] = useState<{ code: string; expiresAt: string; what: string } | null>(null);
	const invite = useMutation({
		mutationFn: (b: { kind: Kind; memberId?: string; name?: string; what: string }) => api.invite({ kind: b.kind, memberId: b.memberId, name: b.name }),
		onSuccess: (r, b) => {
			setIssued({ ...r, what: b.what });
			void refresh();
		},
	});
	const cancel = useMutation({ mutationFn: api.cancelInvite, onSettled: refresh });
	const remove = useMutation({ mutationFn: api.removeSignIn, onSettled: refresh });
	const signOut = useMutation({ mutationFn: api.signOutDevice, onSettled: refresh });
	const handOver = useMutation({ mutationFn: api.setHolder, onSuccess: (st) => qc.setQueryData(["auth"], st), onSettled: refresh });
	const [newName, setNewName] = useState("");
	const [newKind, setNewKind] = useState<Kind>("guardian");
	const me = status?.signedIn ? status : null;

	function inviteNew(e: FormEvent) {
		e.preventDefault();
		const name = newName.trim();
		if (!name) return;
		invite.mutate({ kind: newKind, name, what: newKind === "guardian" ? `${name} (guardian)` : `${name}'s device` });
		setNewName("");
	}

	if (!data || !me) return null;
	return (
		<section className={panel.bare}>
			{me.role === "guardian" && me.kind === "user" && <MyPin hasPin={me.hasPin} onSaved={(st) => qc.setQueryData(["auth"], st)} />}

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
									? `${p.holder ? "Account holder" : ROLE[p.role]} · ${p.account ? (p.email ?? "own account") : "signs in on devices added by code"}${p.role === "guardian" && !p.hasPin ? " · no PIN yet" : ""}`
									: "Doesn't sign in"}
							</span>
						</span>
						<span className={s.actions}>
							{p.role !== "guardian" && (
								<button type="button" className={panel.textLink}
									onClick={() => invite.mutate({ kind: "kid", memberId: p.memberId, what: `${p.name}'s device` })}>
									Add a device
								</button>
							)}
							{!p.account && (
								<button type="button" className={panel.textLink}
									onClick={() => invite.mutate({ kind: "guardian", memberId: p.memberId, what: `${p.name} (guardian)` })}>
									Invite as guardian
								</button>
							)}
							{me.holder && p.role === "guardian" && !p.holder && p.membershipId && (
								<button type="button" className={panel.textLink}
									onClick={() => setHanding({ id: p.membershipId!, name: p.name })}>
									Make account holder
								</button>
							)}
							{p.membershipId && p.memberId !== me.memberId && (
								<button type="button" className={panel.textLink}
									onClick={() => setRemoving({ id: p.membershipId!, name: p.name })}>
									Remove sign-in
								</button>
							)}
						</span>
					</li>
				))}
			</ul>
			<p className={s.hint}>
				A kid with their own phone and account can be invited as a guardian would be, then signs in themselves; younger kids' devices just use a code.
				The account holder OKs new colors for people, and the wall wears their accent color.
			</p>
			{remove.isError && <p className={s.error}>{remove.error.message}</p>}
			{handOver.isError && <p className={s.error}>{handOver.error.message}</p>}

			<form className={s.row} onSubmit={inviteNew}>
				<input className={s.input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Someone new" aria-label="Name" maxLength={40} />
				<select className={s.input} value={newKind} onChange={(e) => setNewKind(e.target.value as Kind)} aria-label="As" style={{ flex: "none" }}>
					<option value="guardian">Guardian</option>
					<option value="kid">Kid</option>
				</select>
				<button className={s.primary} disabled={!newName.trim() || invite.isPending}>Invite</button>
			</form>

			<h3 className={s.subhead}>The wall</h3>
			<p className={s.hint}>
				Get a code, then type it on the wall's screen. The wall asks for a guardian's PIN to open, and again to change things.
			</p>
			<button type="button" className={panel.textLink} style={{ alignSelf: "flex-start" }} disabled={me.guardianPins === 0}
				onClick={() => invite.mutate({ kind: "wall", what: "the wall" })}>
				Add a wall display
			</button>
			{me.guardianPins === 0 && <p className={s.hint}>A guardian sets their PIN first.</p>}

			{data.invites.length > 0 && (
				<>
					<h3 className={s.subhead}>Codes not used yet</h3>
					<ul className={panel.devices}>
						{data.invites.map((i) => (
							<li key={i.id}>
								<span>{i.kind === "wall" ? "The wall" : `${i.for ?? "Someone"} (${i.kind})`}</span>
								<span className={panel.deviceSeen}>until {new Date(i.expiresAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
								<button type="button" className={panel.textLink} onClick={() => cancel.mutate(i.id)}>Cancel</button>
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
							{d.who ?? "Someone"}
							{DEVICE[d.kind]} · {d.label}
							{d.thisDevice && <strong> (this one)</strong>}
						</span>
						<span className={panel.deviceSeen}>{ago(d.lastSeen)}</span>
						{!d.thisDevice && (
							<button type="button" className={panel.textLink} onClick={() => signOut.mutate(d.id)}>Sign out</button>
						)}
					</li>
				))}
			</ul>

			<div className={s.row}>
				{me.kind === "wall" ? (
					<button type="button" className={panel.textLink} onClick={() => void api.lockWall().then((st) => qc.setQueryData(["auth"], st))}>
						Lock the wall
					</button>
				) : (
					<button type="button" className={panel.textLink}
						onClick={() => void api.signOut().then(() => { qc.clear(); qc.setQueryData(["auth"], { signedIn: false }); })}>
						Sign out of this device
					</button>
				)}
				{me.households.length > 1 && (
					<select className={s.input} value={me.household?.id} aria-label="Household" style={{ flex: "none" }}
						onChange={(e) => void api.useHousehold(e.target.value).then((st) => { qc.clear(); qc.setQueryData(["auth"], st); })}>
						{me.households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
					</select>
				)}
			</div>
			{removing && (
				<ConfirmDialog title={`Sign ${removing.name} out of this household?`} confirmLabel="Remove sign-in"
					onCancel={() => setRemoving(null)}
					onConfirm={() => { remove.mutate(removing.id); setRemoving(null); }}>
					They stay in the family.
				</ConfirmDialog>
			)}
			{handing && (
				<ConfirmDialog title={`Make ${handing.name} the account holder?`} confirmLabel="Hand it over"
					onCancel={() => setHanding(null)}
					onConfirm={() => { handOver.mutate(handing.id); setHanding(null); }}>
					They'll OK new colors for people, and the wall will wear their accent color. Only they can hand it back.
				</ConfirmDialog>
			)}
		</section>
	);
}

/** A new code, big enough to read across the room, with a link to send. */
function Issued({ code, expiresAt, what, onClose }: { code: string; expiresAt: string; what: string; onClose: () => void }) {
	const link = `${location.origin}/?join=${code}`;
	const [copied, setCopied] = useState(false);
	const share = async () => {
		if (navigator.share) await navigator.share({ title: "Join our household", text: `Your code is ${code}`, url: link }).catch(() => {});
		else await navigator.clipboard.writeText(link).then(() => setCopied(true), () => {});
	};
	return (
		<div className={s.issued}>
			<span className={s.hint}>Code for {what}</span>
			<span className={s.bigCode}>{code}</span>
			<span className={s.hint}>Works once, until {new Date(expiresAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
			<div className={s.row} style={{ justifyContent: "center" }}>
				<button type="button" className={s.link} onClick={() => void share()}>{copied ? "Link copied" : "Send the link"}</button>
				<button type="button" className={s.link} onClick={onClose}>Done</button>
			</div>
		</div>
	);
}

/** This guardian's PIN: opens the wall and unlocks it (or a kid's device) for changes. */
function MyPin({ hasPin, onSaved }: { hasPin: boolean; onSaved: (s: AuthStatus) => void }) {
	const [editing, setEditing] = useState(!hasPin);
	const [pin, setPin] = useState("");
	const [again, setAgain] = useState("");
	const save = useMutation({
		mutationFn: () => api.setMyPin(pin),
		onSuccess: (st) => {
			onSaved(st);
			setEditing(false);
			setPin("");
			setAgain("");
		},
	});
	const problem = !/^\d{4,8}$/.test(pin) ? "4 to 8 digits" : pin !== again ? "The two don't match" : null;

	if (!editing) {
		return (
			<p className={s.hint}>
				Your PIN is set: it opens the wall and unlocks changes there.{" "}
				<button type="button" className={panel.textLink} onClick={() => setEditing(true)}>Change it</button>
			</p>
		);
	}
	return (
		<form className={panel.pinForm} onSubmit={(e) => { e.preventDefault(); if (!problem) save.mutate(); }}>
			<p className={s.hint}>Your guardian PIN opens the wall, and unlocks changes there or on a kid's device.</p>
			<input type="password" inputMode="numeric" autoComplete="new-password" placeholder="New PIN" aria-label="New PIN"
				value={pin} onChange={(e) => setPin(e.target.value)} maxLength={8} />
			<input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Again" aria-label="New PIN again"
				value={again} onChange={(e) => setAgain(e.target.value)} maxLength={8} />
			{pin && problem && <p className={panel.pinError}>{problem}</p>}
			{save.isError && <p className={panel.pinError}>{save.error.message}</p>}
			<div className={s.row}>
				<button className={s.primary} disabled={!!problem || save.isPending}>Save PIN</button>
				{hasPin && <button type="button" className={panel.textLink} onClick={() => setEditing(false)}>Cancel</button>}
			</div>
		</form>
	);
}
