import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAlertActions, useAlerts } from "../lib/queries";
import type { CalEvent, Trip } from "../lib/types";
import { timeLabel } from "../lib/dates";
import s from "../styles/EventDialog.module.css";

/** Miles where people drive in miles, kilometres elsewhere. */
const distance = (meters: number) =>
	/^en-(US|GB|LR|MM)$/i.test(navigator.language)
		? `${(meters / 1609.34).toFixed(meters < 16093 ? 1 : 0)} mi`
		: `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;

/** The event's address and, on request, the drive time from home and when to leave. */
export default function TravelInfo({ event, showAddress = true }: { event: CalEvent; showAddress?: boolean }) {
	const [trip, setTrip] = useState<Trip | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	// The request in flight, so it can be cancelled (or given up on) without waiting.
	const inFlight = useRef<AbortController | null>(null);
	useEffect(() => () => inFlight.current?.abort(), []);
	const alert = (useAlerts().data ?? []).find((a) => a.eventId === event.id);
	const { add, cancel } = useAlertActions();
	if (!event.location) return null;

	async function check() {
		const ctrl = new AbortController();
		inFlight.current = ctrl;
		// Google is usually quick; past this, give up rather than leave it spinning.
		const giveUp = setTimeout(() => ctrl.abort("slow"), 12_000);
		setLoading(true);
		setError(null);
		try {
			setTrip(await api.travel(event.id, ctrl.signal));
		} catch (e) {
			if (ctrl.signal.aborted) setError(ctrl.signal.reason === "slow" ? "Taking too long — try again" : null);
			else setError(e instanceof Error ? e.message : "Couldn't get a travel time");
		} finally {
			clearTimeout(giveUp);
			if (inFlight.current === ctrl) inFlight.current = null;
			setLoading(false);
		}
	}

	return (
		<div className={s.travel}>
			{showAddress && (
				<div className={s.address}>
					<span aria-hidden="true">📍</span> {event.location}
				</div>
			)}
			{!trip && (
				<div className={s.travelRow}>
					<button type="button" className={s.travelButton} onClick={check} disabled={loading}>
						🚗 {loading ? "Checking traffic…" : error ? "Try again" : "Travel time"}
					</button>
					{loading && (
						<button type="button" className={s.travelCancel} onClick={() => inFlight.current?.abort("cancel")}>
							Cancel
						</button>
					)}
				</div>
			)}
			{trip && (
				<div className={`${s.trip} ${trip.late ? s.tripLate : ""}`}>
					<strong>{trip.minutes} min drive</strong> · {distance(trip.meters)}
					<div>
						{!trip.leaveAt
							? "Leaving now"
							: trip.late
								? `Leave now: you needed to go at ${timeLabel(trip.leaveAt)}`
								: `Leave by ${timeLabel(trip.leaveAt)} to arrive on time`}
					</div>
				</div>
			)}
			{/* Step two: an alert on the wall when it's time to go. */}
			{alert ? (
				<div className={s.alertSet}>
					🔔 Reminder at {timeLabel(alert.remindAt)}
					{alert.minutesBefore ? ` (${alert.minutesBefore} min before leaving)` : " (time to leave)"}
					<button type="button" className={s.linkButton} onClick={() => cancel.mutate(alert.id)}>
						Cancel
					</button>
				</div>
			) : (
				trip?.leaveAt &&
				!trip.late && (
					<div className={s.remind}>
						<span>🔔 Remind me</span>
						{[
							[0, "At leave time"],
							[10, "10 min before"],
							[15, "15 min before"],
						].map(([min, label]) => (
							<button
								key={min}
								type="button"
								className={s.chip}
								disabled={add.isPending}
								onClick={() => add.mutate({ eventId: event.id, minutesBefore: min as number })}
							>
								{label}
							</button>
						))}
					</div>
				)
			)}
			{add.isError && <div className={s.problem}>Couldn't set the reminder: {add.error.message}</div>}
			{error && <div className={s.problem}>{error}</div>}
		</div>
	);
}
