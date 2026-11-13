import { type CSSProperties, type ReactNode } from 'react';
import { addDays, dayKey, fromDayKey, timeLabel, longDate } from '../../lib/dates';
import { useEventWeather, useRangeEvents, useTravelTimes, useWeather } from '../../lib/queries';
import { grownUpKindWordsFor, quoteFor } from '../../lib/grownUpWords';
import { sky } from '../../lib/weather';
import { useNow } from '../../lib/useNow';
import { LANDSCAPE_TABLET, useMediaQuery } from '../../lib/useMediaQuery';
import { firstName } from '../../lib/people';
import type { CalEvent, Member } from '../../lib/types';
import type { Page } from '../nav/NavBar';
import { DayCalendar } from '../ui/DayCarousel';
import ForecastCard, { ForecastLoading } from './ForecastCard';
import PhotoCard from '../photos/PhotoCard';
import KidsToday from './KidsToday';
import NeedsYou from './NeedsYou';
import SpecialDays from './SpecialDays';
import { packed } from '../calendar/EventChecklist';
import { forecastBadge } from '../calendar/EventForecast';
import { Loading, Skeleton } from '../ui/Skeleton';
import s from './Today.module.css';

interface Props {
	today: string;
	members: Member[];
	/** The person this device is signed in as; null on the wall (the whole family's day). */
	me: string | null;
	/** Parent changes are allowed right now (Caught being good). */
	parent: boolean;
	onPage: (page: Page) => void;
	onOpenEvent: (event: CalEvent) => void;
	/** A grown-up adding a special day (a new event marked special); left out while the parent lock's on. */
	onAddSpecial?: () => void;
	/** The photo slideshow's "Play screen saver". */
	onPlaySlideshow: () => void;
}

/** Be there this many minutes before it starts, for parking and walking in (as server/travel.ts plans). */
const ARRIVE_EARLY_MINUTES = 10;
/** The calendar's days: today, tomorrow and the rest of the week. */
const WEEK = 7;

/** "Good morning", "Good afternoon" or "Good evening". */
function greeting(now: Date) {
	const h = now.getHours();
	return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * Today (phones open on it): the family's calendar (today, tomorrow, the rest of the week), the
 * weather, special days coming up, how the kids are doing, what needs me, a quote and kind words for the
 * day, and the family's photo slideshow. On a tablet or a phone on its side, the cards in rows of two
 * (three on a big screen).
 */
export default function TodayPage({
	today,
	members,
	me,
	parent,
	onPage,
	onOpenEvent,
	onAddSpecial,
	onPlaySlideshow,
}: Props) {
	const now = useNow();
	const day = fromDayKey(today);
	const meMember = members.find((m) => m.id === me) ?? null;
	const weatherQuery = useWeather();
	const weather = weatherQuery.data;

	// The week ahead: today, tomorrow and the five days after.
	const eventsQuery = useRangeEvents(day, WEEK);
	const events = eventsQuery.data ?? [];
	// The weather at the ones far from home (the server leaves out nearby ones).
	const away = useEventWeather(events.filter((e) => e.location && !e.busy).map((e) => e.id)).data ?? {};
	const ended = (e: CalEvent) => (e.allDay ? e.end <= today : Date.parse(e.end) <= now.getTime());
	const onDay = (e: CalEvent, d: string) => (e.allDay ? e.start <= d && e.end > d : dayKey(new Date(e.start)) === d);
	const sorted = [...events].sort((a, b) =>
		a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1,
	);
	const todays = sorted.filter((e) => onDay(e, today));
	const upNext = todays.filter((e) => !ended(e));
	const earlier = todays.filter(ended);
	const tomorrows = sorted.filter((e) => onDay(e, dayKey(addDays(day, 1))));
	// The rest of the week, day by day (an all-day event over several days: once, on its first).
	const shown = new Set([...todays, ...tomorrows].map((e) => e.id));
	const restOfWeek = Array.from({ length: WEEK - 2 }, (_, i) => dayKey(addDays(day, i + 2)))
		.map((key) => {
			const on = sorted.filter((e) => onDay(e, key) && !shown.has(e.id));
			on.forEach((e) => shown.add(e.id));
			return { key, events: on };
		})
		.filter((d) => d.events.length > 0);
	const drives = useTravelTimes(upNext.map((e) => e.id)).data ?? {};

	const who = (e: CalEvent) => (e.memberIds.length === 0 ? [] : members.filter((m) => e.memberIds.includes(m.id)));
	const when = (e: CalEvent) =>
		e.allDay ? 'All day' : `${timeLabel(e.start)}${e.end ? ` – ${timeLabel(e.end)}` : ''}`;

	const eventRow = (e: CalEvent, showLeave: boolean) => {
		const people = who(e);
		const drive = drives[e.id];
		const leaveAt =
			showLeave && !e.allDay && drive ? new Date(Date.parse(e.start) - (drive + ARRIVE_EARLY_MINUTES) * 60_000) : null;
		const soon = leaveAt && leaveAt.getTime() - now.getTime() < 30 * 60_000;
		return (
			<li key={e.id}>
				<button
					type="button"
					className={s.event}
					data-busy={e.busy || undefined}
					onClick={() => onOpenEvent(e)}
					style={{ '--c': people[0]?.color ?? 'var(--line)' } as CSSProperties}
				>
					<span className={s.when}>{when(e)}</span>
					<span className={s.what}>
						<span className={s.title}>{e.title}</span>
						{e.location && <span className={s.where}>{e.location}</span>}
						{people.length > 0 && <span className={s.where}>{people.map((p) => p.name).join(', ')}</span>}
						{/* Far from home: the weather there (opening the event shows more). */}
						{away[e.id] && forecastBadge(away[e.id]) && (
							<span className={s.leave}>{forecastBadge(away[e.id])} there</span>
						)}
						{/* What to bring: how much is packed (opening the event shows the list). */}
						{e.checklist.length > 0 && (
							<span className={`${s.leave} ${e.checklist.every((x) => x.done) ? s.packed : ''}`}>
								🎒 {packed(e.checklist)}
							</span>
						)}
						{/* Under the event, so the title keeps the row's width on a phone. */}
						{leaveAt && (
							<span className={`${s.leave} ${soon ? s.leaveSoon : ''}`}>
								{leaveAt.getTime() <= now.getTime() ? 'Leave now' : `Leave by ${timeLabel(leaveAt)}`}
							</span>
						)}
					</span>
				</button>
			</li>
		);
	};

	const list = (items: CalEvent[], leave = false) => (
		<ul className={s.events}>{items.map((e) => eventRow(e, leave))}</ul>
	);
	const calendar: { label: string; body: ReactNode }[] = [
		{
			label: 'Today',
			body: (
				<>
					{todays.length === 0 ? (
						<p className={s.none}>Nothing on the calendar today.</p>
					) : upNext.length === 0 ? (
						<p className={s.none}>Nothing else today.</p>
					) : (
						list(upNext, true)
					)}
					{earlier.length > 0 && (
						<details className={s.earlier}>
							<summary className={s.subHead}>Earlier today ({earlier.length})</summary>
							{list(earlier)}
						</details>
					)}
				</>
			),
		},
		{
			label: 'Tomorrow',
			body: tomorrows.length === 0 ? <p className={s.none}>Nothing on tomorrow.</p> : list(tomorrows),
		},
		{
			label: 'Rest of the week',
			body:
				restOfWeek.length === 0 ? (
					<p className={s.none}>Nothing else this week.</p>
				) : (
					restOfWeek.map((d) => (
						<div key={d.key} className={s.weekGroup}>
							<h3 className={s.subHead}>
								{fromDayKey(d.key).toLocaleDateString([], {
									weekday: 'long',
									month: 'short',
									day: 'numeric',
								})}
							</h3>
							{list(d.events)}
						</div>
					))
				),
		},
	];
	const look = weather && sky(weather.code, weather.isDay);
	const quote = quoteFor(today);
	const kind = grownUpKindWordsFor(today);
	// A tablet on its side, or anything bigger: the calendar in a column of its own on the right.
	const twoColumns = useMediaQuery(LANDSCAPE_TABLET);

	// The cards. A tablet on its side and anything bigger: two columns, the calendar on the right (today,
	// then tomorrow and the rest of the week under it) with the special days under it, the rest down the
	// left. Otherwise one list.
	const calendarCard = (
		<section className={`${s.card} ${s.wide}`} aria-label="Calendar">
			{/* Loading: a few event-shaped rows, so the calendar isn't "nothing today" before it knows. */}
			{eventsQuery.isPending ? (
				<Loading label="Loading the calendar">
					<Skeleton width="60%" height="2.4rem" round />
					<Skeleton height="3.6rem" />
					<Skeleton height="3.6rem" />
					<Skeleton height="3.6rem" />
				</Loading>
			) : (
				<DayCalendar days={calendar} styles={s} stacked={twoColumns} />
			)}
		</section>
	);
	const weatherCard = weather ? (
		<ForecastCard weather={weather} />
	) : weatherQuery.isPending ? (
		<ForecastLoading />
	) : null;
	const specialCard = <SpecialDays today={today} onAdd={onAddSpecial} />;
	const kidsCard = <KidsToday today={today} members={members} parent={parent} onPage={onPage} />;
	const needsCard = <NeedsYou me={me} onPage={onPage} />;
	const quoteCard = (
		<section className={s.card} aria-label="Quote of the day">
			<h2 className={s.cardHead}>Quote of the day</h2>
			<blockquote className={s.quote}>
				<p>“{quote.text}”</p>
				<footer>{quote.by}</footer>
			</blockquote>
		</section>
	);
	const encouragementCard = (
		<section className={s.card} aria-label="Encouragement">
			<h2 className={s.cardHead}>
				Encouragement <span className={s.cardHeadSubtext}>(from parent to parent)</span>
			</h2>
			<p className={s.kindWords}>
				<span className={s.kindPicture} aria-hidden="true">
					{kind.picture}
				</span>
				{kind.text}
			</p>
		</section>
	);
	// The family's slideshow (the screen saver's photos), as on the calendar.
	const photosCard = <PhotoCard onPlay={onPlaySlideshow} className={`${s.wide} ${s.slideshow}`} />;

	return (
		<section className={s.page} aria-label="Today">
			<header className={s.head}>
				<div className={s.headText}>
					<h1 className={s.hello}>
						{greeting(now)}
						{meMember ? `, ${firstName(meMember.name)}` : ''}
					</h1>
					<div className={s.date}>
						{longDate(now)} · <span className={s.nowrap}>{timeLabel(now)}</span>
					</div>
				</div>
				{weatherQuery.isPending && (
					<Loading label="Loading the weather" className={s.headWeather}>
						<Skeleton width="4.5rem" height="2.2rem" />
					</Loading>
				)}
				{weather && look && (
					<div className={s.headWeather} aria-label={`${weather.temp}°, feels like ${weather.feels}°, ${look.label}`}>
						<span className={s.headIcon} aria-hidden="true">
							{look.icon}
						</span>
						<span className={s.headTemp}>{weather.temp}°</span>
						<span className={s.headFeels}>Feels {weather.feels}°</span>
					</div>
				)}
			</header>

			<div className={s.scroll}>
				{twoColumns ? (
					<div className={s.columns}>
						<div className={s.column}>
							{quoteCard}
							{encouragementCard}
							{weatherCard}
							{kidsCard}
							{needsCard}
							{photosCard}
						</div>
						<div className={s.column}>
							{calendarCard}
							{specialCard}
						</div>
					</div>
				) : (
					<div className={s.cards}>
						{calendarCard}
						{weatherCard}
						{specialCard}
						{kidsCard}
						{needsCard}
						{quoteCard}
						{encouragementCard}
						{photosCard}
					</div>
				)}
			</div>
		</section>
	);
}
