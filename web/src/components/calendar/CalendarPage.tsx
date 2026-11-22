import { useRangeEvents, useSettings, useSyncStatus } from '../../lib/queries';
import type { taskProgress } from '../../lib/tasks';
import type { CalEvent, Member, Task } from '../../lib/types';
import type { useCalendarView, View } from '../../lib/useCalendarView';
import { NARROW, useMediaQuery } from '../../lib/useMediaQuery';
import PhotoCard from '../photos/PhotoCard';
import { Loading, Skeleton } from '../ui/Skeleton';
import Problem, { loadProblem } from '../ui/Problem';
import DailyCards from './DailyCards';
import DayPanel from './DayPanel';
import MonthView from './MonthView';
import NowLine from './NowLine';
import OutboxNotices from './OutboxNotices';
import { Notice } from '../ui/Notice';
import PeopleFilter, { eventShown } from './PeopleFilter';
import WeatherCard from './WeatherCard';
import WeekView from './WeekView';
import WeekTimeline from './WeekTimeline';
import s from './CalendarPage.module.css';

const VIEWS: [View, string][] = [
	['month', 'Month'],
	['week', 'Week'],
];

const fmt = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
const monthName = (d: Date) => d.toLocaleDateString([], { month: 'long' });

/**
 * The calendar: the month's name with the time and weather, the name filters, Month or Week with ‹ Today ›,
 * then the days (the selected one open in the day panel). Problems with the calendar's sync show as banners
 * above. Under the week: the photo slideshow, the weather, and the day's joke and quote.
 */
export default function CalendarPage({
	today,
	members,
	tasks,
	progress,
	focus,
	onFocus,
	calendar,
	onAdd,
	onOpen,
	onPlaySlideshow,
}: {
	today: string;
	members: Member[];
	tasks: Task[];
	progress: ReturnType<typeof taskProgress>;
	/** The name filters (kept by the app: Tasks follows a single one). */
	focus: string[];
	onFocus: (focus: string[]) => void;
	/** The month or week on screen and the day open (kept by the app, so it stays put across pages). */
	calendar: ReturnType<typeof useCalendarView>;
	/** Adding an event (missing while the parent lock is on). */
	onAdd?: (day: string) => void;
	onOpen: (event: CalEvent, day: string) => void;
	onPlaySlideshow: () => void;
}) {
	const { view, changeView, cursor, selected, setSelected, days, step, goToday } = calendar;
	const settings = useSettings();
	const eventsQuery = useRangeEvents(days[0], days.length);
	const sync = useSyncStatus().data;
	// Below 960px the week is one scrolling list of days, and the weather scrolls at its end.
	const narrow = useMediaQuery(NARROW);
	const shown = eventShown(focus);
	const events = (eventsQuery.data ?? []).filter(shown);

	// The month on screen, or both months when the week crosses into a new one.
	const month =
		view === 'month' || days[0].getMonth() === days[6].getMonth()
			? monthName(view === 'month' ? cursor : days[0])
			: `${monthName(days[0])} – ${monthName(days[6])}`;
	const unit = view === 'month' ? 'month' : 'week';

	// Under the week: the photo slideshow, beside the weather with the day's joke and quote beneath it.
	const cards = (
		<div className={s.cards}>
			<PhotoCard onPlay={onPlaySlideshow} />
			<div className={s.cardsSide}>
				<WeatherCard />
				<div className={s.cardsDaily}>
					<DailyCards today={today} />
				</div>
			</div>
		</div>
	);

	return (
		<>
			<div className={s.monthHeaderTitle}>
				<div>
					<h1 className={s.monthTitle}>
						<strong>{month}</strong>
					</h1>
					<NowLine />
				</div>
				{/* Beside the month; on phones, under the time and weather. */}
				<PeopleFilter members={members} tasks={tasks} progress={progress} focus={focus} onFocus={onFocus} />
			</div>
			<header className={s.header}>
				<div className={s.group}>
					<div className={s.segmented} role="group" aria-label="View">
						{VIEWS.map(([v, label]) => (
							<button
								key={v}
								className={view === v ? s.on : ''}
								aria-pressed={view === v}
								onClick={() => changeView(v)}
							>
								{label}
							</button>
						))}
					</div>
					{/* ‹ Today › and the dates move to the next line together when there's no room. */}
					<div className={s.stepper}>
						<button className={s.pill} onClick={() => step(-1)} aria-label={`Previous ${unit}`}>
							‹
						</button>
						<button className={s.pill} onClick={goToday}>
							Today
						</button>
						<button className={s.pill} onClick={() => step(1)} aria-label={`Next ${unit}`}>
							›
						</button>
						<h1 className={s.title}>{view === 'month' ? cursor.getFullYear() : `${fmt(days[0])} – ${fmt(days[6])}`}</h1>
					</div>
				</div>
			</header>

			{eventsQuery.isError && (
				<Notice tone="danger" icon="⚠️" title="Can't reach the calendar" details={eventsQuery.error.message} />
			)}
			{sync?.lastError && (
				<Notice
					tone="danger"
					icon="⚠️"
					title="Calendar sync failed"
					details={`${sync.lastError.replace(/\.?$/, '.')} Showing what was last synced.`}
				/>
			)}
			<OutboxNotices />
			{sync?.peopleError && (
				<Notice tone="warn" title="Couldn't sort new events by person" details={sync.peopleError} />
			)}

			<div className={s.body}>
				{/* Wait for the saved view so the page doesn't flash Week before Month; until then, and
				    while the events come in, a grid of grey days. */}
				{eventsQuery.isError ? (
					<Problem
						kind="page"
						message={loadProblem('the calendar', eventsQuery.error)}
						onRetry={() => void eventsQuery.refetch()}
					/>
				) : settings.isPending || eventsQuery.isPending ? (
					<Loading
						label="Loading the calendar"
						className={view === 'week' ? s.calendarLoading : s.calendarLoadingMonth}
					>
						{Array.from({ length: view === 'week' ? 7 : 35 }, (_, i) => (
							<Skeleton key={i} height={view === 'week' ? '4rem' : '5.5rem'} />
						))}
					</Loading>
				) : view === 'month' ? (
					// Every size: the month grid (condensed below 1040px: a bar for each event).
					<MonthView
						days={days}
						month={cursor.getMonth()}
						today={today}
						selected={selected}
						events={events}
						members={members}
						onSelect={setSelected}
						onOpen={onOpen}
					/>
				) : view === 'week' && !narrow ? (
					// Wide screens: the week by the hour. Narrower ones keep the list (seven hour columns get too thin).
					<WeekTimeline
						days={days}
						today={today}
						selected={selected}
						events={events}
						members={members}
						onSelect={setSelected}
						onOpen={onOpen}
					/>
				) : (
					<WeekView
						days={days}
						today={today}
						selected={selected}
						events={events}
						members={members}
						onSelect={setSelected}
						onOpen={onOpen}
						footer={view === 'week' && narrow ? cards : undefined}
					/>
				)}
				{selected && (
					<DayPanel
						shown={shown}
						day={selected}
						today={today}
						members={members}
						onAdd={onAdd}
						onOpen={onOpen}
						onClose={() => setSelected(null)}
					/>
				)}
			</div>
		</>
	);
}
