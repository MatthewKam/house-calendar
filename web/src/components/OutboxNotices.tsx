import { useOutbox, useResolveConflict } from "../lib/queries";
import { fromDayKey, timeLabel } from "../lib/dates";
import type { EventDetails } from "../lib/types";
import s from "../styles/OutboxNotices.module.css";

/** "Tue, Oct 6, 9:00 AM – 10:00 AM", or the days of an all-day event. */
function when(d: EventDetails) {
	const day = (x: Date) => x.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
	return d.allDay ? `${day(fromDayKey(d.start))}, all day` : `${day(new Date(d.start))}, ${timeLabel(d.start)} – ${timeLabel(d.end)}`;
}

/**
 * The details changed on the wall, side by side with iCloud's. Only these are sent if the wall's
 * version is kept, so other differences (made on the phone) aren't listed.
 */
function differences(mine: EventDetails, theirs: EventDetails, changed: (keyof EventDetails)[]) {
	const rows: { label: string; mine: string; theirs: string }[] = [];
	if (changed.includes("title")) rows.push({ label: "Title", mine: mine.title, theirs: theirs.title });
	if (changed.includes("start")) rows.push({ label: "When", mine: when(mine), theirs: when(theirs) });
	if (changed.includes("location")) {
		rows.push({ label: "Address", mine: mine.location || "None", theirs: theirs.location || "None" });
	}
	return rows;
}

/**
 * Notices about iCloud events changed on the wall: a conflict (changed on another device too) asks
 * which version to keep; edits stuck waiting (offline) say so.
 */
export default function OutboxNotices() {
	const outbox = useOutbox().data;
	const resolve = useResolveConflict();
	if (!outbox) return null;
	return (
		<>
			{outbox.conflicts.map((c) => (
				<div key={c.id} className={s.conflict} role="alert">
					{c.theirs ? (
						<>
							<div className={s.headline}>
								“{c.mine.title}” was also changed on another device. Which version should stay?
							</div>
							<table className={s.compare}>
								<thead>
									<tr>
										<th />
										<th>Here</th>
										<th>iCloud</th>
									</tr>
								</thead>
								<tbody>
									{differences(c.mine, c.theirs, c.changed).map((r) => (
										<tr key={r.label}>
											<th>{r.label}</th>
											<td>{r.mine}</td>
											<td>{r.theirs}</td>
										</tr>
									))}
								</tbody>
							</table>
							<div className={s.actions}>
								<button className={s.secondary} disabled={resolve.isPending} onClick={() => resolve.mutate({ id: c.id, keep: "theirs" })}>
									Use iCloud's
								</button>
								<button className={s.primary} disabled={resolve.isPending} onClick={() => resolve.mutate({ id: c.id, keep: "mine" })}>
									Keep mine
								</button>
							</div>
						</>
					) : (
						<>
							<div className={s.headline}>
								“{c.mine.title}” was deleted on another device, so your change to it wasn't saved.
							</div>
							<div className={s.actions}>
								<button className={s.primary} disabled={resolve.isPending} onClick={() => resolve.mutate({ id: c.id, keep: "theirs" })}>
									OK
								</button>
							</div>
						</>
					)}
				</div>
			))}
			{outbox.pending > 0 && outbox.lastError && (
				<div className={s.waiting}>
					↻ {outbox.pending === 1 ? "1 change is" : `${outbox.pending} changes are`} waiting to be sent to iCloud
					({outbox.lastError}). It'll keep trying.
				</div>
			)}
		</>
	);
}
