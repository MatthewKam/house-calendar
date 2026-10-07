import { useEffect, useRef, useState } from "react";
import { useAlertActions, useAlerts } from "../lib/queries";
import s from "../styles/LeaveAlerts.module.css";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** A soft two-note chime. Browsers may block sound until someone has touched the page; that's fine. */
function chime() {
	try {
		const ctx = new AudioContext();
		[660, 880].forEach((freq, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
			gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.35 + 0.03);
			gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.6);
			osc.connect(gain).connect(ctx.destination);
			osc.start(ctx.currentTime + i * 0.35);
			osc.stop(ctx.currentTime + i * 0.35 + 0.65);
		});
	} catch {
		// No sound available; the alert still shows.
	}
}

/** Shows "time to leave" alerts on the wall when they're due, until someone taps Got it. */
export default function LeaveAlerts() {
	const alerts = useAlerts().data ?? [];
	const { dismiss } = useAlertActions();
	// Re-check every 15 seconds, so an alert appears within moments of its time.
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 15_000);
		return () => clearInterval(t);
	}, []);
	const due = alerts.filter((a) => Date.parse(a.remindAt) <= now);

	// Chime once for each alert that comes due.
	const chimed = useRef(new Set<string>());
	useEffect(() => {
		const fresh = due.filter((a) => !chimed.current.has(a.id));
		if (fresh.length) chime();
		fresh.forEach((a) => chimed.current.add(a.id));
	}, [due]);

	if (due.length === 0) return null;
	return (
		<>
		{/* Outside the stack: its transform would pin a fixed child to the stack instead of the screen. */}
		<div className={s.zoom} aria-hidden="true">
			<span className={s.car}>🚗</span>
			<span className={s.dust}>💨</span>
		</div>
		<div className={s.stack} role="alert">
			{due.map((a) => {
				const leaveNow = Date.parse(a.leaveAt) <= now;
				return (
					<div key={a.id} className={s.alert}>
						<div className={s.icon} aria-hidden="true">
							🚗
						</div>
						<div className={s.body}>
							<div className={s.title}>
								{leaveNow ? "Time to leave" : `Leave in ${Math.max(1, Math.round((Date.parse(a.leaveAt) - now) / 60_000))} min`} for {a.title}
							</div>
							<div className={s.detail}>
								{a.driveMinutes} min drive to arrive by {time(a.arriveBy)} · leave by {time(a.leaveAt)}
							</div>
						</div>
						<button className={s.ok} onClick={() => dismiss.mutate(a.id)}>
							Got it
						</button>
					</div>
				);
			})}
		</div>
		</>
	);
}
