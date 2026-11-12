import type { SignedIn } from "../../lib/api";

/** The person's initial in their color; the wall gets a screen. */
export default function Avatar({ status, big }: { status: SignedIn; big?: boolean }) {
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
