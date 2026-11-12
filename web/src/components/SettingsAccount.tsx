import { useQueryClient } from "@tanstack/react-query";
import { api, type AuthStatus, type SignedIn } from "../lib/api";
import Avatar from "./Avatar";
import s from "../styles/Account.module.css";
import sheet from "../styles/Sheet.module.css";

/** "Nov 12, 10:04 AM". */
const when = (iso: string) =>
	new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Another household or signed out: nothing on screen belongs any more, so it all loads again. */
function useRestart(onClose: () => void) {
	const qc = useQueryClient();
	return (next: AuthStatus) => {
		qc.clear();
		qc.setQueryData(["auth"], next);
		onClose();
	};
}

/**
 * The top of Settings: who this device is signed in as (the wall: the wall), their email, and when this
 * device signed in; with more than one household, which one it's in.
 */
export function SignedInAs({ status, onClose }: { status: SignedIn; onClose: () => void }) {
	const restart = useRestart(onClose);
	const wall = status.role === "wall";
	const how = [
		// Not on a shared screen: whose account the wall is on.
		wall ? null : status.user?.email,
		`${status.kind === "user" ? "Signed in" : "Added"} on this device ${when(status.signedInAt)}`,
	].filter(Boolean).join(" · ");
	return (
		<div className={s.person}>
			<Avatar status={status} big />
			<span className={s.who}>
				<strong>{status.me?.name ?? "The wall"}{status.household && ` · ${status.household.name}`}</strong>
				<span className={s.how}>{how}</span>
			</span>
			{status.households.length > 1 && (
				<select className={s.input} value={status.household?.id} aria-label="Household"
					onChange={(e) => void api.useHousehold(e.target.value).then(restart)}>
					{status.households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
				</select>
			)}
		</div>
	);
}

/** The bottom of Settings: sign this device out (the wall added with a code: lock it, back to the PIN screen). */
export function SignOut({ status, onClose }: { status: SignedIn; onClose: () => void }) {
	const restart = useRestart(onClose);
	return status.kind === "wall" ? (
		<button type="button" className={sheet.secondary} onClick={() => void api.lockWall().then(restart)}>Lock the wall</button>
	) : (
		<button type="button" className={sheet.danger} onClick={() => void api.signOut().then(() => restart({ signedIn: false }))}>Sign out</button>
	);
}
