import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, dayKey, timeLabel } from '../../lib/dates';
import { eventPaint, eventsOn, isOver } from '../../lib/events';
import { UNASSIGNED } from '../../lib/color';
import { inStrip, placeDay } from '../../lib/timegrid';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from '../../lib/useMediaQuery';
import { useAllDayFolded } from '../../lib/useFolded';
import { useNow } from '../../lib/useNow';
import type { CalEvent, Member } from '../../lib/types';
import DayMeals from './DayMeals';
import { HourName, TimedEvent } from './WeekTimeline';
import t from './WeekTimeline.module.css';
import s from './WeekCarousel.module.css';

/** Dots on a day's card, one per person with something that day, before the rest are left off. */
const MAX_DOTS = 5;
/** How far (px) a finger goes sideways before the days move with it. */
const STICK = 12;
/** A swipe this fast (px per ms) moves a day however short it is. */
const FLICK = 0.4;

interface Props {
	/** The week's seven days. */
	days: Date[];
	today: string;
	/** The day in the middle. */
	main: string;
	/** Events from the day before the week to the day after it. */
	events: CalEvent[];
	members: Member[];
	/** Puts a day in the middle (the day before or after the week moves to that week). */
	onMain: (day: string) => void;
	onOpen: (event: CalEvent, day: string) => void;
	/** When Today was last tapped: today glides to the middle, and the time now to the middle of its hours. */
	todayAt?: number;
}

/**
 * The week below 1040px: a card for each of its days (a dot for each person with something on it), then
 * the days by the hour side by side, one in the middle with the days before and after it either side
 * (the narrower the screen, the more the middle one takes and the less of them peeks in). Swipe or tap a
 * side day or a card to put it in the middle; swiping past the week's end moves into the next or last
 * week. Tapping an event opens it.
 */
export default function WeekCarousel({ days, today, main, events, members, onMain, onOpen, todayAt = 0 }: Props) {
	const now = useNow();
	const phone = useMediaQuery(PHONE);
	// Whole-day events fold to a thin bar each (meals hidden) under the days' names; the corner button opens
	// or folds them all. Phones (upright or on their side) start folded each time, to leave room for the
	// hours; bigger screens keep what was picked last (shared with the wide week).
	const small = useMediaQuery(PHONE_SIDEWAYS) || phone;
	const [phoneOpen, setPhoneOpen] = useState(false);
	const [keptFolded, setKeptFolded] = useAllDayFolded();
	const expanded = small ? phoneOpen : !keptFolded;
	const setExpanded = (open: boolean) => (small ? setPhoneOpen(open) : setKeptFolded(!open));
	const folded = !expanded;
	// The week with a day either side, so the first and last days can sit in the middle too.
	const all = useMemo(() => [addDays(days[0], -1), ...days, addDays(days[6], 1)], [days]);
	const keys = all.map(dayKey);
	const mainIndex = Math.max(0, keys.indexOf(main));
	const nowHours = (now.getTime() - new Date(now).setHours(0, 0, 0, 0)) / 3_600_000;
	const inHours = events.filter((ev) => !inStrip(ev));

	const track = useRef<HTMLDivElement>(null);
	// A day's width (all are the same); the track's left scroll for day i is i of them.
	const dayWidth = () => track.current?.querySelector<HTMLElement>(`.${s.name}`)?.offsetWidth || 1;

	// Put the middle day in the middle: gliding there within the week, at once when the week changed
	// (its days have moved under the same scroll).
	const week = keys[1];
	const shownWeek = useRef<string | null>(null);
	useLayoutEffect(() => {
		const el = track.current;
		if (!el) return;
		const sameWeek = shownWeek.current === week;
		shownWeek.current = week;
		const left = mainIndex * dayWidth();
		if (Math.abs(el.scrollLeft - left) > 1) el.scrollTo({ left, behavior: sameWeek ? 'smooth' : 'auto' });
	}, [mainIndex, week]);

	// Stay on the middle day when the screen changes size (the days change width).
	const mainRef = useRef(mainIndex);
	mainRef.current = mainIndex;
	useEffect(() => {
		const el = track.current;
		if (!el) return;
		const observer = new ResizeObserver(() => el.scrollTo({ left: mainRef.current * dayWidth() }));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// Folding or opening the whole-day events changes the names' height, and the browser can snap to
	// another day; keep the middle one in the middle.
	useLayoutEffect(() => {
		track.current?.scrollTo({ left: mainRef.current * dayWidth() });
	}, [expanded]);

	// Opens with the time now (or 8 AM) a quarter of the way down, once the text-size setting has settled.
	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			const el = track.current;
			const target = el?.querySelector<HTMLElement>(`.${t.now}`) ?? el?.querySelector<HTMLElement>('[data-hour="8"]');
			if (!el || !target) return;
			el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 4;
		});
		return () => cancelAnimationFrame(frame);
	}, []);

	// Today tapped: one glide that puts today in the middle and the time now halfway down the hours
	// that show under the days' names.
	useEffect(() => {
		if (!todayAt) return;
		const frame = requestAnimationFrame(() => {
			const el = track.current;
			const line = el?.querySelector<HTMLElement>(`.${t.now}`);
			const names = el?.querySelector<HTMLElement>(`.${s.name}`)?.offsetHeight ?? 0;
			if (!el || !line) return;
			const middle = names + (el.clientHeight - names) / 2;
			const top = el.scrollTop + line.getBoundingClientRect().top - el.getBoundingClientRect().top - middle;
			el.scrollTo({ left: mainRef.current * dayWidth(), top, behavior: 'smooth' });
		});
		return () => cancelAnimationFrame(frame);
	}, [todayAt]);

	// After a swipe settles (snapped to a day), that day is the middle one.
	const settle = useRef<number | undefined>(undefined);
	const onScroll = () => {
		window.clearTimeout(settle.current);
		settle.current = window.setTimeout(() => {
			const el = track.current;
			if (!el) return;
			const i = Math.min(keys.length - 1, Math.max(0, Math.round(el.scrollLeft / dayWidth())));
			if (keys[i] !== main) onMain(keys[i]);
		}, 120);
	};
	useEffect(() => () => window.clearTimeout(settle.current), []);

	// A finger's sideways swipe (the browser only scrolls up and down, .track's touch-action). The days
	// move once it's clearly sideways, then follow the finger; letting go springs back to the middle day
	// unless it went a fifth of a day or was flicked, which moves on a day (or more, for a long drag).
	const drag = useRef<{
		id: number;
		x: number;
		left: number;
		moved: boolean;
		lastX: number;
		t: number;
		v: number;
	} | null>(null);
	const dragged = useRef(false);
	const [dragging, setDragging] = useState(false);
	const onPointerDown = (e: React.PointerEvent) => {
		if (e.pointerType !== 'touch' || !track.current) return;
		dragged.current = false;
		drag.current = {
			id: e.pointerId,
			x: e.clientX,
			left: track.current.scrollLeft,
			moved: false,
			lastX: e.clientX,
			t: e.timeStamp,
			v: 0,
		};
	};
	const onPointerMove = (e: React.PointerEvent) => {
		const d = drag.current;
		const el = track.current;
		if (!d || !el || d.id !== e.pointerId) return;
		const dx = e.clientX - d.x;
		if (!d.moved) {
			if (Math.abs(dx) < STICK) return;
			d.moved = true;
			dragged.current = true;
			el.setPointerCapture(e.pointerId);
			setDragging(true);
		}
		// Speed (px per ms), smoothed, for a flick.
		const dt = Math.max(1, e.timeStamp - d.t);
		d.v = 0.6 * d.v + 0.4 * ((e.clientX - d.lastX) / dt);
		d.lastX = e.clientX;
		d.t = e.timeStamp;
		el.scrollLeft = d.left - dx;
	};
	const onPointerEnd = (e: React.PointerEvent) => {
		const d = drag.current;
		const el = track.current;
		if (!d || d.id !== e.pointerId) return;
		drag.current = null;
		if (!d.moved || !el) return;
		setDragging(false);
		const w = dayWidth();
		const dx = d.left - el.scrollLeft; // + is a swipe to the right (back a day)
		// A flick goes the way the finger was moving at the end.
		const flick = Math.abs(d.v) > FLICK ? Math.sign(d.v) : 0;
		let steps = Math.round(Math.abs(dx) / w);
		if (steps === 0 && (Math.abs(dx) > w * 0.2 || (flick && flick === Math.sign(dx)))) steps = 1;
		const i = Math.min(keys.length - 1, Math.max(0, mainIndex - Math.sign(dx) * steps));
		if (i === mainIndex) el.scrollTo({ left: mainIndex * w, behavior: 'smooth' });
		else onMain(keys[i]);
	};

	return (
		<div className={s.carousel}>
			{/* The week's days as cards: today's number filled in, the middle day ringed, a dot per person. */}
			<div className={s.cards}>
				{days.map((day) => {
					const key = dayKey(day);
					const colors = [
						...new Set(
							eventsOn(events, day).flatMap((ev) => {
								const people = eventPaint(ev, members).people;
								return people.length ? people.map((m) => m.color) : [UNASSIGNED];
							}),
						),
					].slice(0, MAX_DOTS);
					return (
						<button
							key={key}
							type="button"
							className={[s.card, key === today && s.cardToday, key === main && s.cardMain, key < today && s.cardPast]
								.filter(Boolean)
								.join(' ')}
							aria-pressed={key === main}
							aria-label={day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
							onClick={() => onMain(key)}
						>
							<span className={s.cardDow}>{day.toLocaleDateString([], { weekday: phone ? 'narrow' : 'short' })}</span>
							<span className={s.cardNum}>{day.getDate()}</span>
							<span className={s.dots} aria-hidden="true">
								{colors.map((c) => (
									<span key={c} className={s.dot} style={{ background: c }} />
								))}
							</span>
						</button>
					);
				})}
			</div>

			<div className={s.frame}>
				{/* Sprig's sprout in the corner cut out above "all-day" (outside the days, which slide under it). */}
				<img src="/favicon.svg" alt="" className={s.logo} />
				<div
					ref={track}
					className={`${s.track} ${dragging ? s.dragging : ''}`}
					onScroll={onScroll}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerEnd}
					onPointerCancel={onPointerEnd}
					// A swipe isn't a tap on what it started on.
					onClickCapture={(e) => {
						if (!dragged.current) return;
						dragged.current = false;
						e.stopPropagation();
					}}
				>
					{/* Row 1: the days' names, with their whole-day events and meals; they stay at the top. */}
					<span className={s.corner}>
						<button
							type="button"
							className={s.fold}
							aria-expanded={expanded}
							aria-label={expanded ? 'Fold all-day events' : 'Show all-day events'}
							onClick={() => setExpanded(!expanded)}
						>
							<span className={s.allDayLabel}>all-day</span>
							<span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
						</button>
					</span>
					<span className={s.pad} />
					{all.map((day, i) => {
						const key = dayKey(day);
						return (
							<div
								key={key}
								className={[
									s.name,
									key === today && s.nameToday,
									key < today && s.namePast,
									i !== mainIndex && s.side,
									i < mainIndex && s.before,
								]
									.filter(Boolean)
									.join(' ')}
								onClick={() => {
									if (i !== mainIndex) onMain(key);
									// Open on a phone: tapping the middle day's names (not an event) folds them again.
									else if (small && expanded) setExpanded(false);
								}}
							>
								<h3 className={s.title}>
									<span className={s.weekday}>{day.toLocaleDateString([], { weekday: 'long' })}</span>
									<span className={s.num}>{day.getDate()}</span>
								</h3>
								{folded ? (
									// Folded: a bar in its people's colours for each; tap to open them all.
									<span
										className={s.foldedBars}
										onClick={(e) => {
											if (i !== mainIndex) return;
											e.stopPropagation();
											setExpanded(true);
										}}
									>
										{eventsOn(events, day)
											.filter(inStrip)
											.map((ev) => (
												<span
													key={ev.id}
													className={`${s.foldedBar} ${isOver(ev, now) ? s.foldedOver : ''}`}
													style={eventPaint(ev, members).vars}
												/>
											))}
									</span>
								) : (
									<>
										{eventsOn(events, day)
											.filter(inStrip)
											.map((ev) => (
												<button
													key={ev.id}
													type="button"
													className={`${s.allDay} ${isOver(ev, now) ? t.past : ''}`}
													style={eventPaint(ev, members).vars}
													data-busy={ev.busy || undefined}
													onClick={(e) => {
														e.stopPropagation();
														onOpen(ev, key);
													}}
													title={ev.allDay ? ev.title : `${ev.title}, from ${timeLabel(ev.start)}`}
												>
													{ev.title}
												</button>
											))}
										<DayMeals day={key} />
									</>
								)}
							</div>
						);
					})}
					<span className={s.pad} />

					{/* Row 2: the hours in the margin (they stay at the left), then each day's 24 hours. */}
					<div className={s.gutter}>
						{Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
							<span key={h} data-hour={h} className={t.hour} style={{ top: `${(h / 24) * 100}%` }}>
								<HourName h={h} />
							</span>
						))}
					</div>
					<span className={`${s.pad} ${s.hours}`} />
					{all.map((day, i) => {
						const key = dayKey(day);
						return (
							<div
								key={key}
								className={[
									s.hours,
									s.column,
									key === today && s.columnToday,
									key < today && s.columnPast,
									i !== mainIndex && s.side,
								]
									.filter(Boolean)
									.join(' ')}
								onClick={() => i !== mainIndex && onMain(key)}
							>
								{placeDay(inHours, day, 0, 24).map((p) => (
									<TimedEvent key={p.ev.id} placed={p} day={day} now={now} members={members} onOpen={onOpen} />
								))}
								{/* The time now, in today's column, moving down every minute. */}
								{key === today && (
									<div
										className={t.now}
										style={{ top: `${(nowHours / 24) * 100}%` }}
										aria-label={`Now, ${timeLabel(now)}`}
									/>
								)}
							</div>
						);
					})}
					<span className={`${s.pad} ${s.hours}`} />
				</div>
			</div>
		</div>
	);
}
