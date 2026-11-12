import { useQueryClient } from "@tanstack/react-query";
import { api, type AuthStatus, type SignedIn } from "../lib/api";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Account.module.css";
import Sheet from "./Sheet";

const ROLE = { guardian: "Guardian", kid: "Kid", wall: "The family wall" };

/**
 * Who this device is signed in as, from the bar's avatar: switch household, sign out, lock the wall, or
 * leave wall mode (a guardian's device acting as the wall: unlocked with a PIN first).
 */
export default function AccountSheet({ status, onClose, onKidMode }: { status: SignedIn; onClose: () => void; onKidMode?: () => void }) {
	const qc = useQueryClient();

	// Another household or signed out: nothing on screen belongs any more.
	const restart = (next: AuthStatus) => {
		qc.clear();
		qc.setQueryData(["auth"], next);
		onClose();
	};
	const wall = status.kind === "wall";
	const wallMode = status.wallMode;
	const how = [
		status.role ? ROLE[status.role] : null,
		status.kind === "device" ? "on this device" : null,
		wallMode ? "wall mode" : null,
		// Not on a shared screen: whose account the wall is on.
		wallMode ? null : status.user?.email,
		status.household?.name,
	].filter(Boolean).join(" · ");

	return (
		<>
			<Sheet label="Signed in" onClose={onClose} className={sheet.confirm}>
				<div className={s.person}>
					<Avatar status={status} big />
					<span className={s.who}>
						<strong>{status.me?.name ?? (wall || wallMode ? "The wall" : "Signed in")}</strong>
						<span className={s.how}>{how}</span>
					</span>
				</div>
				{!status.parentAlways && (
					<p className={s.hint}>{status.parent ? `Unlocked for changes${status.unlockedBy ? ` by ${status.unlockedBy}` : ""}.` : "Locked: changes need a guardian's PIN."}</p>
				)}
				{status.households.length > 1 && (
					<select className={s.input} value={status.household?.id} aria-label="Household"
						onChange={(e) => void api.useHousehold(e.target.value).then(restart)}>
						{status.households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
					</select>
				)}
				{wallMode && !status.parent && <p className={s.hint}>Unlock with a guardian's PIN to leave wall mode.</p>}
				<div className={sheet.actions}>
					{wallMode ? (
						<button type="button" className={sheet.secondary} disabled={!status.parent}
							onClick={() => void api.setWallMode(false).then(restart)}>
							Leave wall mode
						</button>
					) : wall ? (
						<button type="button" className={sheet.secondary} onClick={() => void api.lockWall().then(restart)}>
							Lock the wall
						</button>
					) : (
						<button type="button" className={sheet.secondary} onClick={() => void api.signOut().then(() => restart({ signedIn: false }))}>
							Sign out
						</button>
					)}
					<span className={sheet.spacer} />
					{/* A kid's own device is in kid mode already. */}
					{onKidMode && status.role !== "kid" && (
						<button type="button" className={sheet.secondary} onClick={onKidMode}>Kid mode</button>
					)}
					<button type="button" className={sheet.primary} onClick={onClose}>Done</button>
				</div>
			</Sheet>
		</>
	);
}

/** The person's initial in their color; the wall gets a screen. */
export function Avatar({ status, big }: { status: SignedIn; big?: boolean }) {
	const size = big ? "3rem" : "2.2rem";
	if (!status.me) {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", flex: "none" }}>
				<rect x="3" y="4.5" width="18" height="12" rx="2" />
				<path d="M9 20h6M12 16.5V20" />
			</svg>
		);
	}
	return (
		<span aria-hidden="true" style={{
			width: size, height: size, borderRadius: "50%", background: status.me.color, color: "#fff", flex: "none",
			display: "inline-grid", placeItems: "center", fontWeight: 700, fontSize: big ? "1.3rem" : "1rem",
		}}>
			{status.me.name.trim().charAt(0).toUpperCase()}
		</span>
	);
}
