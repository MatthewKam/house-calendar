import { useEffect, useRef, type CSSProperties } from 'react';
import { dayKey, timeLabel } from '../../lib/dates';
import { eventPaint, isOver } from '../../lib/events';
import { inStrip, placeDay, weekBars } from '../../lib/timegrid';
import { useNow } from '../../lib/useNow';
import type { CalEvent, Member } from '../../lib/types';
import DayMeals from './DayMeals';
import s from './WeekTimeline.module.css';

interface Props {
	days: Date[];
	today: string;
	/** Day shown in the day panel, if open. */
	selected: string | null;
	events: CalEvent[];
	members: Member[];
	onSelect: (day: string) => void;
	onOpen: (event: CalEvent, day: string) => void;
}

/** "8 AM" with a small "AM", and "Noon". */
function HourName({ h }: { h: number }) {
	if (h === 12) return <>Noon</>;
	const [n, ampm] = new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' }).split(' ');
	return (
		<>
			{n} {ampm && <small>{ampm}</small>}
		</>
	);
}

/**
 * The week by the hour, like the day panel's timeline for seven days side by side: a strip across the
 * top with the meals and the events that take whole days (one bar over all the days an event covers),
 * then 24 hours that scroll together, each event a block from its start to its end. Today's column has
 * the time now. Tapping a day's name opens it in the day panel; tapping an event opens it.
 */
export default function WeekTimeline({ days, today, selected, events, members, onSelect, onOpen }: Props) {
	const now = useNow();
	const bars = weekBars(events, days);
	const rows = bars.reduce((n, b) => Math.max(n, b.row + 1), 0);
	// Each day is a list: its bars, then its meals right under them (not under the week's tallest stack).
	const barsOn = (col: number) =>
		bars.filter((b) => b.from <= col && col < b.to).reduce((n, b) => Math.max(n, b.row + 1), 0);
	const inHours = events.filter((ev) => !inStrip(ev));
	const nowHours = (now.getTime() - new Date(now).setHours(0, 0, 0, 0)) / 3_600_000;
	const todayCol = days.findIndex((d) => dayKey(d) === today);

	const scroller = useRef<HTMLDivElement>(null);
	// Opens with the time now (this week) or the first event or 8 AM near the top, once the text-size
	// setting has settled the layout.
	const first = dayKey(days[0]);
	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			const el = scroller.current;
			const target = [`.${s.now}`, `.${s.event}`, '[data-hour="8"]']
				.map((q) => el?.querySelector<HTMLElement>(q))
				.find(Boolean);
			if (!el || !target) return;
			el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 4;
		});
		return () => cancelAnimationFrame(frame);
		// Only when the week changes, not every minute.
	}, [first]);

	return (
		<div className={s.week}>
			{/* The days' names: today's number in the accent, the one open in the panel ringed. */}
			<div className={s.head}>
				{days.map((day) => {
					const key = dayKey(day);
					return (
						<button
							key={key}
							type="button"
							className={`${s.dayName} ${key === today ? s.today : ''} ${key < today ? s.pastName : ''} ${key === selected ? s.selected : ''}`}
							onClick={() => onSelect(key)}
							aria-label={day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
						>
							<span className={s.dow}>{day.toLocaleDateString([], { weekday: 'short' })}</span>
							<span className={s.num}>{day.getDate()}</span>
						</button>
					);
				})}
			</div>

			{/* Whole days: a bar over every day an event covers, then each day's meals. */}
			{/* Bar rows are the bars' own height, so they stack tight on every day; a day's meals run from under its
			    bars into the last row, which grows for the tallest. */}
			<div className={s.strip} style={{ gridTemplateRows: rows ? `repeat(${rows}, var(--bar)) auto` : 'auto' }}>
				{/* Today's column, outlined in the accent like its name above and its hours below. */}
				{todayCol >= 0 && <span className={s.stripToday} style={{ gridColumn: todayCol + 2 }} aria-hidden="true" />}
				{/* Days that are over, tinted in the strip like their names and hours. */}
				{days.map((day, i) =>
					dayKey(day) < today ? (
						<span key={dayKey(day)} className={s.stripPast} style={{ gridColumn: i + 2 }} aria-hidden="true" />
					) : null,
				)}
				<span className={s.stripLabel}>all-day</span>
				{bars.map((b) => {
					const paint = eventPaint(b.ev, members);
					return (
						<button
							key={b.ev.id}
							type="button"
							className={`${s.bar} ${b.before ? s.before : ''} ${b.after ? s.after : ''} ${isOver(b.ev, now) ? s.past : ''}`}
							style={
								{
									...paint.vars,
									color: paint.text,
									gridColumn: `${b.from + 2} / ${b.to + 2}`,
									gridRow: b.row + 1,
								} as CSSProperties
							}
							data-busy={b.ev.busy || undefined}
							onClick={() => onOpen(b.ev, dayKey(days[b.from]))}
							title={b.ev.allDay ? b.ev.title : `${b.ev.title}, from ${timeLabel(b.ev.start)}`}
						>
							{b.before && (
								<span className={s.arrow} aria-hidden="true">
									‹
								</span>
							)}
							<span className={s.barTitle}>{b.ev.title}</span>
							{b.after && (
								<span className={s.arrow} aria-hidden="true">
									›
								</span>
							)}
						</button>
					);
				})}
				{days.map((day, i) => (
					<div key={dayKey(day)} className={s.meals} style={{ gridColumn: i + 2, gridRow: `${barsOn(i) + 1} / -1` }}>
						<DayMeals day={dayKey(day)} />
					</div>
				))}
			</div>

			<div ref={scroller} className={s.scroll}>
				<div className={s.hours}>
					{/* The hour labels in the margin. */}
					{Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
						<span key={h} data-hour={h} className={s.hour} style={{ top: `${(h / 24) * 100}%` }}>
							<HourName h={h} />
						</span>
					))}
					<div className={s.columns}>
						{days.map((day, i) => {
							const key = dayKey(day);
							return (
								<div
									key={key}
									className={`${s.column} ${key === today ? s.todayColumn : ''} ${key < today ? s.pastColumn : ''}`}
									onClick={() => onSelect(key)}
								>
									{placeDay(inHours, day, 0, 24).map((p) => {
										const short = p.hours < 0.75;
										const starts = Date.parse(p.ev.start) >= day.getTime();
										return (
											<button
												key={p.ev.id}
												type="button"
												className={`${s.event} ${short ? s.short : ''} ${isOver(p.ev, now) ? s.past : ''}`}
												style={
													{
														...eventPaint(p.ev, members).vars,
														top: `${p.top * 100}%`,
														height: `${p.height * 100}%`,
														left: `calc(${(p.col / p.cols) * 100}% + 1px)`,
														width: `calc(${100 / p.cols}% - 3px)`,
													} as CSSProperties
												}
												data-busy={p.ev.busy || undefined}
												onClick={(e) => {
													e.stopPropagation();
													onOpen(p.ev, key);
												}}
												title={`${p.ev.title}, ${timeLabel(p.ev.start)} – ${timeLabel(p.ev.end)}`}
											>
												<span className={s.title}>{p.ev.title}</span>
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
									{/* The time now, in today's column, moving down every minute. */}
									{i === todayCol && (
										<div
											className={s.now}
											style={{ top: `${(nowHours / 24) * 100}%` }}
											aria-label={`Now, ${timeLabel(now)}`}
										/>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
