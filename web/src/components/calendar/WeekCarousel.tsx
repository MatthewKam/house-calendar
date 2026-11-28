import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, dayKey, timeLabel } from '../../lib/dates';
import { eventPaint, eventsOn, isOver } from '../../lib/events';
import { UNASSIGNED } from '../../lib/color';
import { inStrip, placeDay } from '../../lib/timegrid';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from '../../lib/useMediaQuery';
import { useAllDayFolded } from '../../lib/useFolded';
import { useNow } from '../../lib/useNow';
import type { CalEvent, Member } from '../../lib/types';
import Sprout from '../ui/Sprout';
import DayMeals from './DayMeals';
import { HourName, TimedEvent } from './WeekTimeline';
import t from './styles/WeekTimeline.module.css';
import { wheelSwipe } from '../../lib/wheelSwipe';
import { feel } from '../../lib/haptics';
import s from './styles/WeekCarousel.module.css';

/** Dots on a day's card, one per person with something that day, before the rest are left off. */
const MAX_DOTS = 5;
/** How far (px) a finger goes before its swipe picks a way: up and down (the hours scroll) or sideways
 *  (the days move), and keeps to it until it lets go. */
const DECIDE = 10;
/** A swipe moves the days only when it's clearly sideways: within 30° of flat (it went 1 / tan 30° as far
 *  across as up or down). Anything steeper, a thumb's slanting swipe down too, scrolls the hours. */
const SIDEWAYS = 1.73;
/** How far a day must be dragged (a share of its width) to move on to the next one. */
const MOVE_ON = 0.3;
/** A swipe this fast (px per ms) moves a day however short it is. */
const FLICK = 0.4;

/** Where the days slide to for day i (of the nine) in the middle: --day follows the frame's width, so
 *  they stay there as the screen turns or folds. */
const at = (i: number) => `calc(${-i} * var(--day))`;
/** How far (px) the days have slid, partway through a glide too. */
function slidOf(el: HTMLElement | null) {
	const transform = el ? getComputedStyle(el).transform : 'none';
	return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
}

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
 * (the narrower the screen, the more the middle one takes and the less of them peeks in; under 500px it
 * takes the whole width, the others out of sight). Swipe or tap a
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

	// The days' names on top and the hours under them, each in a strip of the nine days that slides
	// sideways (both together); only the hours scroll, up and down.
	const week = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);
	const names = useRef<HTMLDivElement>(null);
	const hours = useRef<HTMLDivElement>(null);
	// A day's width (all are the same), exact, fractions and all.
	const dayWidth = () => names.current?.querySelector<HTMLElement>(`.${s.name}`)?.getBoundingClientRect().width || 1;
	/** Slides the days to x, gliding there (the strips' own transition) or straight there. */
	const slide = (x: string, glide: boolean) => {
		for (const el of [names.current, hours.current]) {
			if (!el) continue;
			el.style.transition = glide ? '' : 'none';
			el.style.transform = `translate3d(${x}, 0, 0)`;
		}
	};

	const mainRef = useRef(mainIndex);
	mainRef.current = mainIndex;
	const latest = useRef({ keys, onMain });
	latest.current = { keys, onMain };
	/** Puts day i (of the nine) in the middle, gliding there; the day before or after the week moves to
	 *  that week. */
	const go = (i: number) => {
		const { keys, onMain } = latest.current;
		const to = Math.min(keys.length - 1, Math.max(0, i));
		slide(at(to), true);
		if (to !== mainRef.current) onMain(keys[to]);
	};

	// The middle day in the middle: gliding there within the week. Into the next or last week (a swipe
	// past the week's end, a tap on the day before or after it), the days have moved under the strips, so
	// the glide carries on from the same place among the new days; any other change of week is at once.
	const first = all[0].getTime();
	const shownFirst = useRef<number | null>(null);
	useLayoutEffect(() => {
		const was = shownFirst.current;
		shownFirst.current = first;
		if (was === first) return slide(at(mainIndex), true);
		if (was !== null) {
			const w = dayWidth();
			const x = slidOf(hours.current) + Math.round((first - was) / 86_400_000) * w;
			if (Math.abs(x + mainIndex * w) <= w * 1.05) {
				slide(`${x}px`, false);
				void hours.current?.offsetWidth; // there now, so the glide starts from it
				return slide(at(mainIndex), true);
			}
		}
		slide(at(mainIndex), false);
	}, [mainIndex, first]);

	// Opens with the time now (or 8 AM) a quarter of the way down, once the text-size setting has settled.
	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			const el = body.current;
			const target = el?.querySelector<HTMLElement>(`.${t.now}`) ?? el?.querySelector<HTMLElement>('[data-hour="8"]');
			if (!el || !target) return;
			el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 4;
		});
		return () => cancelAnimationFrame(frame);
	}, []);

	// Today tapped: today glides to the middle (above, as it becomes the middle day) and the time now to
	// halfway down the hours.
	useEffect(() => {
		if (!todayAt) return;
		const frame = requestAnimationFrame(() => {
			const el = body.current;
			const line = el?.querySelector<HTMLElement>(`.${t.now}`);
			if (!el || !line) return;
			const top =
				el.scrollTop + line.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 2;
			el.scrollTo({ top, behavior: 'smooth' });
		});
		return () => cancelAnimationFrame(frame);
	}, [todayAt]);

	// The hours scrolled under the days' names: a shadow under them.
	const [scrolled, setScrolled] = useState(false);
	// And a tick for each hour that passes as a finger (or a wheel) scrolls them, like a picker's; not when
	// Sprig scrolls them itself (to now, or Today). A fling's glide after the finger lifts ticks on too.
	const hourTick = useRef({ hour: -1, by: 0 });
	const onScroll = () => {
		const el = body.current;
		if (!el) return;
		setScrolled(el.scrollTop > 0);
		const column = el.querySelector<HTMLElement>(`.${s.column}`);
		const hourPx = column ? column.offsetHeight / 24 : 0;
		if (!hourPx) return;
		const hour = Math.floor(el.scrollTop / hourPx);
		const tick = hourTick.current;
		const now = performance.now();
		if (now - tick.by < 400) {
			tick.by = now;
			if (hour !== tick.hour && tick.hour !== -1) feel('select');
		}
		tick.hour = hour;
	};
	useEffect(() => {
		const el = body.current;
		if (!el) return;
		const byHand = () => (hourTick.current.by = performance.now());
		el.addEventListener('touchmove', byHand, { passive: true });
		el.addEventListener('wheel', byHand, { passive: true });
		return () => {
			el.removeEventListener('touchmove', byHand);
			el.removeEventListener('wheel', byHand);
		};
	}, []);

	// A finger's swipe keeps to one way, picked in its first DECIDE px: clearly sideways (SIDEWAYS), and the
	// days follow the finger while the hours are held (the touch's moves are cancelled, so the browser
	// doesn't scroll them); anything else is the browser's own scroll up and down, untouched. Letting go
	// moves on a day if it went MOVE_ON of one or was flicked that way (never more than one day, however
	// hard), else springs back; so does a touch the browser takes over. Touch events, not pointer events:
	// only they can stop iOS's own scroll once a swipe turns out to be sideways.
	const dragged = useRef(false);
	useEffect(() => {
		const el = week.current;
		const scroller = body.current;
		if (!el || !scroller) return;
		let d: {
			x: number;
			y: number;
			/** The hours' scroll when the finger went down, held while the days move. */
			top: number;
			/** null until it's picked a way. */
			way: 'sideways' | 'down' | null;
			/** Where the days were when the swipe turned sideways, and where they are now (px). */
			from: number;
			slid: number;
			w: number;
			lastX: number;
			t: number;
			v: number;
		} | null = null;
		const springBack = () => slide(at(mainRef.current), true);
		const start = (e: TouchEvent) => {
			if (e.touches.length !== 1) {
				if (d?.way === 'sideways') springBack();
				d = null;
				return;
			}
			const t = e.touches[0];
			dragged.current = false;
			d = {
				x: t.clientX,
				y: t.clientY,
				top: scroller.scrollTop,
				way: null,
				from: 0,
				slid: 0,
				w: 1,
				lastX: 0,
				t: 0,
				v: 0,
			};
		};
		const move = (e: TouchEvent) => {
			if (!d || d.way === 'down') return;
			const t = e.touches[0];
			if (!d.way) {
				const dx = t.clientX - d.x;
				const dy = t.clientY - d.y;
				if (Math.hypot(dx, dy) < DECIDE) return;
				// Up and down, or slanting (or the browser has already started scrolling): the hours'.
				if (!e.cancelable || Math.abs(dx) < Math.abs(dy) * SIDEWAYS) {
					d.way = 'down';
					return;
				}
				d.way = 'sideways';
				dragged.current = true;
				// From here the days follow the finger, from where they are (partway through a glide too).
				d.x = t.clientX;
				d.from = d.slid = slidOf(hours.current);
				d.w = dayWidth();
				d.lastX = t.clientX;
				d.t = e.timeStamp;
			}
			// Sideways: no scrolling up or down while the days move.
			if (e.cancelable) e.preventDefault();
			// Speed (px per ms), smoothed, for a flick.
			const dt = Math.max(1, e.timeStamp - d.t);
			d.v = 0.6 * d.v + 0.4 * ((t.clientX - d.lastX) / dt);
			d.lastX = t.clientX;
			d.t = e.timeStamp;
			// No further than a day either way from the middle one.
			const rest = -mainRef.current * d.w;
			d.slid = Math.max(rest - d.w, Math.min(rest + d.w, d.from + t.clientX - d.x));
			slide(`${d.slid}px`, false);
			if (scroller.scrollTop !== d.top) scroller.scrollTop = d.top;
		};
		const end = () => {
			const was = d;
			d = null;
			if (was?.way !== 'sideways') return;
			const off = was.slid + mainRef.current * was.w; // + is to the right (back a day)
			// A flick goes the way the finger was moving at the end (one back the other way springs back);
			// otherwise far enough moves on.
			const flick = Math.abs(was.v) > FLICK ? Math.sign(was.v) : 0;
			const on = flick ? flick === Math.sign(off) : Math.abs(off) > was.w * MOVE_ON;
			if (!on || !off) return springBack();
			// A tick as the swipe moves to another day (lib/haptics).
			feel('select');
			go(mainRef.current - Math.sign(off));
		};
		// The browser took the touch: back to the middle day, never on to another.
		const cancel = () => {
			const was = d;
			d = null;
			if (was?.way === 'sideways') springBack();
		};
		// A trackpad's sideways swipe (or a mouse's sideways wheel): one day per swipe, however long it
		// coasts, and quick swipes in a row a day each (lib/wheelSwipe.ts tells them apart). Up and down
		// over the days' names scrolls the hours, as it would over them.
		const swipes = wheelSwipe();
		const wheel = (e: WheelEvent) => {
			if (e.ctrlKey) return;
			if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) {
				if (scroller.contains(e.target as Node)) return;
				e.preventDefault();
				scroller.scrollTop += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
				return;
			}
			e.preventDefault();
			const step = swipes.push(e.deltaX, e.timeStamp);
			if (!step) return;
			const i = mainRef.current + step;
			if (i < 0 || i >= latest.current.keys.length) return;
			feel('select');
			go(i);
		};
		el.addEventListener('touchstart', start, { passive: true });
		el.addEventListener('touchmove', move, { passive: false });
		el.addEventListener('touchend', end);
		el.addEventListener('touchcancel', cancel);
		el.addEventListener('wheel', wheel, { passive: false });
		return () => {
			el.removeEventListener('touchstart', start);
			el.removeEventListener('touchmove', move);
			el.removeEventListener('touchend', end);
			el.removeEventListener('touchcancel', cancel);
			el.removeEventListener('wheel', wheel);
		};
		// Once: the current main day, days and onMain come through refs (go and slide only read them).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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
				{/* Sprig's sprout in the corner above "all-day" (outside the days, which slide under the corner). */}
				<Sprout className={s.logo} />
				<div
					ref={week}
					className={s.week}
					// A swipe isn't a tap on what it started on.
					onClickCapture={(e) => {
						if (!dragged.current) return;
						dragged.current = false;
						e.stopPropagation();
					}}
				>
					{/* The days' names, with their whole-day events and meals; they stay at the top. */}
					<div className={`${s.head} ${scrolled ? s.scrolled : ''}`}>
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
						<div className={s.viewport}>
							<div ref={names} className={s.strip}>
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
											]
												.filter(Boolean)
												.join(' ')}
											onClick={() => {
												if (i !== mainIndex) go(i);
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
							</div>
						</div>
					</div>

					{/* The hours in the margin, then each day's 24 hours: the one part that scrolls, up and down. */}
					<div ref={body} className={s.body} onScroll={onScroll}>
						<div className={s.gutter}>
							{Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
								<span key={h} data-hour={h} className={t.hour} style={{ top: `${(h / 24) * 100}%` }}>
									<HourName h={h} />
								</span>
							))}
						</div>
						<div className={s.viewport}>
							<div ref={hours} className={s.strip}>
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
											onClick={() => i !== mainIndex && go(i)}
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
				</div>
			</div>
		</div>
	);
}
