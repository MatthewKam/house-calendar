import { useEffect, useRef, type CSSProperties } from "react";
import { dayKey, timeLabel } from "../lib/dates";
import { eventPaint, eventsOn, isOver } from "../lib/events";
import { allDayOn, placeDay } from "../lib/timegrid";
import { useNow } from "../lib/useNow";
import type { CalEvent, Member } from "../lib/types";
import s from "../styles/DayTimeline.module.css";

interface Props {
	day: Date;
	today: string;
	events: CalEvent[];
	members: Member[];
	onOpen: (event: CalEvent) => void;
}

/** "8 AM" with a small "AM", and "Noon". */
function HourName({ h }: { h: number }) {
	if (h === 12) return <>Noon</>;
	const [n, ampm] = new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" }).split(" ");
	return (
		<>
			{n} {ampm && <small>{ampm}</small>}
		</>
	);
}

/**
 * A day as a timeline, like Google Calendar's day view: all-day events at the top, then all 24 hours
 * (scrolling) with each event a block from its start to its end, side by side where they overlap,
 * and a red line at the time now.
 */
export default function DayTimeline({ day, today, events, members, onOpen }: Props) {
	const now = useNow();
	const isToday = dayKey(day) === today;
	const allDay = eventsOn(events, day).filter((ev) => allDayOn(ev, day));
	const placed = placeDay(events, day, 0, 24);
	const nowHours = (now.getTime() - new Date(now).setHours(0, 0, 0, 0)) / 3_600_000;

	const root = useRef<HTMLDivElement>(null);
	// Opens with the time now (or the first event, or 8 AM) in the middle, or scrolled as far as it
	// goes near the day's ends. A frame later, once the text-size setting has settled the layout.
	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			const el = root.current;
			// In that order of preference (one combined selector would take whichever comes first on the page).
			const target = [`.${s.now}`, `.${s.event}`, '[data-hour="8"]'].map((q) => el?.querySelector<HTMLElement>(q)).find(Boolean);
			if (!el || !target) return;
			const middle = el.getBoundingClientRect().top + el.clientHeight / 2;
			el.scrollTop += target.getBoundingClientRect().top - middle;
		});
		return () => cancelAnimationFrame(frame);
		// Only when the day changes, not every minute.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [day.getTime()]);

	return (
		<div ref={root} className={s.timeline}>
			{allDay.length > 0 && (
				<ul className={s.allDay}>
					<li className={s.allDayLabel}>all-day</li>
					{allDay.map((ev) => {
						const paint = eventPaint(ev, members);
						return (
							<li key={ev.id}>
								<button className={s.allDayEvent} style={{ ...paint.vars, color: paint.text } as CSSProperties}
									onClick={() => onOpen(ev)}>
									{ev.title}
								</button>
							</li>
						);
					})}
				</ul>
			)}
			<div className={s.hours}>
				{/* The hour labels (the time-now pill takes the place of one it would cover). */}
				{Array.from({ length: 23 }, (_, i) => i + 1)
					.filter((h) => !isToday || Math.abs(h - nowHours) > 0.3)
					.map((h) => (
						<span key={h} data-hour={h} className={s.hour} style={{ top: `${(h / 24) * 100}%` }}>
							<HourName h={h} />
						</span>
					))}
				<div className={s.events}>
					{placed.map((p) => {
						const short = p.hours < 0.75;
						const starts = Date.parse(p.ev.start) >= day.getTime();
						return (
							<button
								key={p.ev.id}
								className={`${s.event} ${short ? s.short : ""} ${isOver(p.ev, now) ? s.past : ""}`}
								style={
									{
										...eventPaint(p.ev, members).vars,
										top: `${p.top * 100}%`,
										height: `${p.height * 100}%`,
										left: `calc(${(p.col / p.cols) * 100}% + 1px)`,
										width: `calc(${100 / p.cols}% - 3px)`,
									} as CSSProperties
								}
								onClick={() => onOpen(p.ev)}
								title={`${p.ev.title}, ${timeLabel(p.ev.start)} – ${timeLabel(p.ev.end)}`}
							>
								<span className={s.title}>{p.ev.title}</span>
								{!short && p.ev.location && <span className={s.where}>{p.ev.location}</span>}
								<span className={s.time}>
									{short
										? timeLabel(starts ? p.ev.start : p.ev.end)
										: starts
											? `${timeLabel(p.ev.start)} – ${timeLabel(p.ev.end)}`
											: `until ${timeLabel(p.ev.end)}`}
								</span>
							</button>
						);
					})}
					{/* The time now, moving down every minute. */}
					{isToday && <div className={s.now} style={{ top: `${(nowHours / 24) * 100}%` }} aria-label={`Now, ${timeLabel(now)}`} />}
				</div>
				{isToday && (
					<span className={s.nowPill} style={{ top: `${(nowHours / 24) * 100}%` }}>
						{timeLabel(now).replace(/\s?[AP]M$/i, "")}
					</span>
				)}
			</div>
		</div>
	);
}
