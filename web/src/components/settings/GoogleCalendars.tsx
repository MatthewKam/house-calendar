import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuthStatus } from "../../lib/queries";
import { ago } from "../../lib/dates";
import type { Member } from "../../lib/types";
import s from "../account/Account.module.css";
import panel from "./Settings.module.css";
import ConfirmDialog from "../ui/ConfirmDialog";

/**
 * Settings → Calendars: each person's Google Calendar. Connecting is from your own phone (Google
 * asks you to allow it, then brings you back); the wall shows who's connected.
 */
export default function GoogleCalendars({ members }: { members: Member[] }) {
	const qc = useQueryClient();
	const status = useAuthStatus().data;
	// The account being disconnected, while that's asked.
	const [disconnecting, setDisconnecting] = useState<{ id: string; account: string } | null>(null);
	const list = useQuery({ queryKey: ["connections"], queryFn: api.connections, refetchInterval: 30_000 }).data?.google;
	const remove = useMutation({
		mutationFn: api.removeConnection,
		onSettled: () => {
			void qc.invalidateQueries({ queryKey: ["connections"] });
			void qc.invalidateQueries({ queryKey: ["calendars"] });
		},
	});
	// The server has no Google client set up.
	if (list === undefined || list === null) return null;
	const ownAccount = status?.signedIn && status.kind === "user" && !status.wallMode;
	const mine = list.some((c) => c.memberId === (status?.signedIn ? status.memberId : null));

	return (
		<section className={panel.bare}>
			{list.length > 0 && (
				<ul className={s.people}>
					{list.map((c) => {
						const who = members.find((m) => m.id === c.memberId);
						return (
							<li key={c.id} className={s.person}>
								<span className={s.dot} style={{ background: who?.color ?? "var(--line)" }} />
								<span className={s.who}>
									<span>{who?.name ?? "Someone"}'s Google Calendar</span>
									<span className={s.how}>
										{c.account} ·{" "}
										{c.lastError ? <span className={s.error}>{c.lastError}</span>
											: c.lastSuccess ? `${c.calendars} calendars, synced ${ago(c.lastSuccess)}` : "Syncing…"}
									</span>
								</span>
								<button type="button" className={panel.textLink}
									onClick={() => setDisconnecting(c)}>
									Disconnect
								</button>
							</li>
						);
					})}
				</ul>
			)}
			{remove.isError && <p className={s.error}>{remove.error.message}</p>}
			{ownAccount ? (
				// A full page visit: Google's pages, then back to the app.
				<a className={s.primary} href="/api/account/google/connect"
					style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
					{mine ? "Connect another Google account" : "Connect my Google Calendar"}
				</a>
			) : (
				<p className={s.hint}>Each person connects their own Google Calendar from Settings on their phone.</p>
			)}
			<p className={s.hint}>Google events show here; change them in Google Calendar.</p>
			{disconnecting && (
				<ConfirmDialog title={`Disconnect ${disconnecting.account}?`} confirmLabel="Disconnect"
					onCancel={() => setDisconnecting(null)}
					onConfirm={() => { remove.mutate(disconnecting.id); setDisconnecting(null); }}>
					Its calendars leave the app.
				</ConfirmDialog>
			)}
		</section>
	);
}
