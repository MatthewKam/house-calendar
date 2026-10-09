import {
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	addDays,
	addMonths,
	dayKey,
	fromDayKey,
	monthGridDays,
	startOfWeek,
} from "./lib/dates";
import type { CalEvent, Task, TaskInput, EventInput, Scope } from "./lib/types";
import {
	useTasks,
	useTasksDone,
	useDeleteTask,
	useDeleteEvent,
	useRestoreEvent,
	useSaveTask,
	useMembers,
	useSaveEvent,
	useSetSetting,
	useSettings,
	useSyncStatus,
	useRangeEvents,
} from "./lib/queries";
import WeekView from "./components/WeekView";
import MonthView from "./components/MonthView";
import DayPanel from "./components/DayPanel";
import EventDialog from "./components/EventDialog";
import TasksPage from "./components/TasksPage";
import NavBar from "./components/NavBar";
import LeaveAlerts from "./components/LeaveAlerts";
import NowLine from "./components/NowLine";
import WeatherCard from "./components/WeatherCard";
import DailyCards from "./components/DailyCards";
import PhotoCard from "./components/PhotoCard";
import OutboxNotices from "./components/OutboxNotices";
import Fab from "./components/Fab";
import { FilterChip } from "./components/NameChip";
import { usePage } from "./lib/usePage";
import ListView from "./components/ListView";
import RewardsPage from "./components/RewardsPage";
import PhotosPage from "./components/PhotosPage";
import ScreenSaver from "./components/ScreenSaver";
import { useScreenSaver } from "./lib/useScreenSaver";
import { useWakeLock } from "./lib/useWakeLock";
import { useCheer } from "./lib/useCheer";
import TaskDialog from "./components/TaskDialog";
import { taskProgress, percent, tasksFor } from "./lib/tasks";
import Celebration from "./components/Celebration";
import MembersPanel from "./components/MembersPanel";
import Toast, { type ToastMessage } from "./components/Toast";
import { UNASSIGNED } from "./lib/color";
import { PHONE, useMediaQuery } from "./lib/useMediaQuery";
import s from "./styles/App.module.css";

/** Today's date key, updated when the clock passes midnight. */
function useToday() {
	const [today, setToday] = useState(() => dayKey(new Date()));
	useEffect(() => {
		const timer = setInterval(() => setToday(dayKey(new Date())), 60_000);
		return () => clearInterval(timer);
	}, []);
	return today;
}

type View = "month" | "week";
const VIEWS: [View, string][] = [
	["month", "Month"],
	["week", "Week"],
];

/** Header filter value for events that aren't for anyone in particular. */
const EVERYONE = "everyone";

export default function App() {
	const today = useToday();
	// Any day inside the month or week on screen.
	const [cursor, setCursor] = useState(() => new Date());
	// Day shown in the right-hand day panel; null when the panel is closed.
	const [selected, setSelected] = useState<string | null>(null);
	// Header filter: a member id, EVERYONE, or null to show all events.
	const [focus, setFocus] = useState<string[]>([]);
	const [dialog, setDialog] = useState<{
		day: string;
		event?: CalEvent;
	} | null>(null);
	// Task sheet: an existing task to edit, or a kid to start a new one for.
	// blank: opened from the round +, so no one is picked yet.
	const [taskDialog, setTaskDialog] = useState<{
		blank?: boolean;
		task?: Task;
		memberId?: string;
	} | null>(null);
	const [showMembers, setShowMembers] = useState(false);
	// The pop-up of names that aren't shown in the header (people without tasks, and Everyone).
	const [moreOpen, setMoreOpen] = useState(false);
	// Which page fills the main area. Kept in the address (#tasks), so a refresh stays on it.
	const [page, setPage] = usePage();
	const [toast, setToast] = useState<ToastMessage | null>(null);

	const closeToast = useCallback(() => setToast(null), []);

	const members = useMembers().data ?? [];
	const settings = useSettings();
	const setSetting = useSetSetting();
	const uiScale = (settings.data?.uiScale as number | undefined) ?? 1;
	// Saved with the display's settings, so a refresh or restart reopens the same view.
	const view: View =
		VIEWS.find(([v]) => v === settings.data?.view)?.[0] ?? "week";
	const saveEvent = useSaveEvent();
	const saveTask = useSaveTask();
	const deleteTask = useDeleteTask();
	// Today's task progress per person, shown as a fill behind each name in the header.
	const tasks = useTasks().data ?? [];
	const tasksDone = useTasksDone(startOfWeek(fromDayKey(today))).data ?? [];
	const progress = taskProgress(
		tasks,
		tasksDone,
		today,
		members.map((m) => m.id),
	);
	const deleteEvent = useDeleteEvent();

	// Confetti and a big Hooray when a kid ticks the last of today's required tasks, or fills a reward jar.
	const cheer = useCheer(members, today);
	const restoreEvent = useRestoreEvent();

	const days = useMemo(
		() =>
			view === "month"
				? monthGridDays(cursor)
				: Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)),
		[view, cursor],
	);
	const eventsQuery = useRangeEvents(days[0], days.length);
	// Phones show Month as the same day-by-day list as Week, just for every day of the month.
	const phone = useMediaQuery(PHONE);
	// Below 960px the week is one scrolling list of days, and the weather scrolls at its end.
	const narrow = useMediaQuery("(max-width: 959.98px)");
	const listDays =
		view === "month" && phone
			? days.filter((d) => d.getMonth() === cursor.getMonth())
			: days;
	// Header filters (any number; none shows everything). A person shows every event they're part of;
	// Everyone shows events for no one in particular. An event shows if it matches any pick.
	const shown = (ev: CalEvent) =>
		focus.length === 0 ||
		focus.some((f) => (f === EVERYONE ? ev.memberIds.length === 0 : ev.memberIds.includes(f)));
	const events = (eventsQuery.data ?? []).filter(shown);
	// A removed person can't stay picked.
	const stale = members.length > 0 ? focus.filter((f) => f !== EVERYONE && !members.some((m) => m.id === f)) : [];
	if (stale.length) setFocus(focus.filter((f) => !stale.includes(f)));
	const sync = useSyncStatus().data;

	// Photos when the wall is idle.
	const saver = useScreenSaver();
	// With the screen saver on, the screen stays on (it takes over instead of the device sleeping),
	// unless the battery is low.
	useWakeLock(saver.settings.enabled && saver.photos.length > 0);
	// Under the week: the photo slideshow, beside the weather with the day's joke and quote beneath it.
	const cards = (
		<div className={s.cards}>
			<PhotoCard onPlay={saver.show} />
			<div className={s.cardsSide}>
				<WeatherCard />
				<div className={s.cardsDaily}>
					<DailyCards today={today} />
				</div>
			</div>
		</div>
	);

	// At midnight, move to the new day if the old one was on screen.
	const [shownToday, setShownToday] = useState(today);
	if (today !== shownToday) {
		setShownToday(today);
		if (days.some((d) => dayKey(d) === shownToday))
			setCursor(fromDayKey(today));
		if (selected === shownToday) setSelected(today);
	}

	const step = (n: number) =>
		setCursor(view === "month" ? addMonths(cursor, n) : addDays(cursor, 7 * n));

	function goToday() {
		setCursor(new Date());
		if (selected) setSelected(today);
	}

	function changeView(next: View) {
		// Keep the selected day in view when switching between month and week.
		if (selected) setCursor(fromDayKey(selected));
		setSetting.mutate({ key: "view", value: next });
	}

	// Any edit that couldn't be saved (it was shown straight away, and has been put back).
	useEffect(() => {
		const failed = (e: Event) => setToast({ text: `Couldn't save: ${(e as CustomEvent<string>).detail}` });
		window.addEventListener("household:save-failed", failed);
		return () => window.removeEventListener("household:save-failed", failed);
	}, []);

	useEffect(() => {
		document.documentElement.style.fontSize = `${18 * uiScale}px`;
	}, [uiScale]);

	function save(input: EventInput) {
		const id = dialog?.event?.id;
		setDialog(null);
		saveEvent.mutate({ id, input });
	}

	function saveTaskInput(input: TaskInput) {
		const id = taskDialog?.task?.id;
		setTaskDialog(null);
		saveTask.mutate({ id, input });
	}

	function removeTask(task: Task) {
		setTaskDialog(null);
		deleteTask.mutate(task.id);
	}

	function remove(ev: CalEvent, scope: Scope = "one") {
		setDialog(null);
		const synced = ev.calendarId !== "local";
		deleteEvent.mutate({ id: ev.id, scope }, {
			onSuccess: () =>
				setToast({
					text: `Deleted “${ev.title}”${ev.repeats ? (scope === "all" ? " (every day)" : " (this day)") : ""}`,
					// iCloud events wait before the delete is sent, so Undo just cancels it.
					undo: () =>
						synced ? restoreEvent.mutate(ev.id) : saveEvent.mutate({
							input: {
								title: ev.title,
								memberIds: ev.memberIds,
								location: ev.location,
								allDay: ev.allDay,
								start: ev.start,
								end: ev.end,
							},
						}),
				}),
		});
	}

	// The day a new event starts on: the day open in the panel, else today if it's on screen, else
	// the first day shown (the 1st, in Month view).
	function newEventDay() {
		if (selected) return selected;
		const shownDays = view === "month" ? days.filter((d) => d.getMonth() === cursor.getMonth()) : days;
		return shownDays.some((d) => dayKey(d) === today) ? today : dayKey(shownDays[0]);
	}

	const fmt = (d: Date, withYear = false) =>
		d.toLocaleDateString([], {
			month: "short",
			day: "numeric",
			...(withYear ? { year: "numeric" } : {}),
		});

	// Header names: people with tasks show; the rest are behind the filter button.
	const everyone = { id: EVERYONE, name: "Everyone", color: UNASSIGNED };
	const withTasks = members.filter((m) => tasksFor(tasks, m.id).length > 0);
	// Until anyone has tasks, show everybody.
	const shownPeople = withTasks.length ? withTasks : [...members, everyone];
	const morePeople = withTasks.length ? [...members.filter((m) => !withTasks.includes(m)), everyone] : [];
	// Picks from the pop-up show in the header too, so it's clear the calendar is filtered.
	const hiddenPicked = morePeople.filter((m) => focus.includes(m.id));
	shownPeople.push(...hiddenPicked);
	const whoButton = (m: { id: string; name: string; color: string }) => {
		// Fills with the person's color as they finish today's tasks.
		const p = progress.get(m.id);
		const pct = percent(p);
		return (
			<FilterChip
				key={m.id}
				name={m.name}
				color={m.color}
				pct={pct}
				on={focus.includes(m.id)}
				dimmed={focus.length > 0 && !focus.includes(m.id)}
				title={`${focus.includes(m.id) ? `Stop filtering by ${m.name}` : `Show ${m.name}'s events`}${p ? ` · tasks today: ${p.done} of ${p.due}` : ""}`}
				// Tap to add or remove a filter; the pop-up stays open so several can be picked.
				onClick={() => setFocus(focus.includes(m.id) ? focus.filter((f) => f !== m.id) : [...focus, m.id])}
			/>
		);
	};

	// Name filters. People with tasks are always shown; the rest (and Everyone) are behind the filter
	// button, except whoever is picked right now. Beside the month; on phones, under the time and weather.
	const people = (
		<div className={s.people}>
			{/* Shows every event again. */}
			{focus.length > 0 && (
				<button className={s.clearFilter} onClick={() => setFocus([])}>
					Clear
				</button>
			)}
			{shownPeople.map(whoButton)}
			{morePeople.length > 0 && (
				<div className={s.moreWrap}>
					<button
						className={`${s.moreButton} ${hiddenPicked.length ? s.moreOn : ""}`}
						aria-expanded={moreOpen}
						aria-label="More people"
						title="More people"
						onClick={() => setMoreOpen(!moreOpen)}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />
						</svg>
					</button>
					{moreOpen && (
						<>
							<div className={s.moreScrim} onClick={() => setMoreOpen(false)} role="presentation" />
							<div className={s.morePanel}>
								{morePeople.map((m) => whoButton(m))}
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);

	// The month on screen, or both months when the week crosses into a new one.
	const monthName = (d: Date) => d.toLocaleDateString([], { month: "long" });
	const month =
		view === "month" || days[0].getMonth() === days[6].getMonth()
			? monthName(view === "month" ? cursor : days[0])
			: `${monthName(days[0])} – ${monthName(days[6])}`;
	const unit = view === "month" ? "month" : "week";

	return (
		<>
			<div className={s.app}>
				<NavBar
					page={page}
					settingsOpen={showMembers}
					onPage={setPage}
					onSettings={() => setShowMembers(true)}
				/>
				<div className={s.shell}>
					{page === "tasks" ? (
						<TasksPage
							today={today}
							members={members}
							focus={focus.length === 1 ? focus[0] : null}
							onAdd={(memberId) => setTaskDialog({ memberId })}
							onEdit={(task) => setTaskDialog({ task })}
						/>
					) : page === "lists" ? (
						<ListView />
					) : page === "rewards" ? (
						<RewardsPage today={today} members={members} />
					) : page === "photos" ? (
						<PhotosPage onPreview={saver.show} />
					) : (<>
					<div className={s.monthHeaderTitle}>
						<div>
							<h1 className={s.monthTitle}>
								<strong>{month}</strong>
							</h1>
							<NowLine />
						</div>
						{people}
					</div>
					<header className={s.header}>
						<div className={s.group}>
							<div className={s.segmented} role="group" aria-label="View">
								{VIEWS.map(([v, label]) => (
									<button
										key={v}
										className={view === v ? s.on : ""}
										aria-pressed={view === v}
										onClick={() => changeView(v)}
									>
										{label}
									</button>
								))}
							</div>
							{/* ‹ Today › and the dates move to the next line together when there's no room. */}
							<div className={s.stepper}>
								<button
									className={s.pill}
									onClick={() => step(-1)}
									aria-label={`Previous ${unit}`}
								>
									‹
								</button>
								<button className={s.pill} onClick={goToday}>
									Today
								</button>
								<button
									className={s.pill}
									onClick={() => step(1)}
									aria-label={`Next ${unit}`}
								>
									›
								</button>
								<h1 className={s.title}>
									{view === "month"
										? cursor.getFullYear()
										: `${fmt(days[0])} – ${fmt(days[6])}`}
								</h1>
								
							</div>
						</div>
					</header>

					{eventsQuery.isError && (
						<div className={s.banner}>
							Can't reach the calendar service ({eventsQuery.error.message})
						</div>
					)}
					{sync?.lastError && (
						<div className={s.banner}>
							iCloud sync failed: {sync.lastError}. Showing what was last
							synced.
						</div>
					)}
					<OutboxNotices />
					{sync?.peopleError && (
						<div className={s.banner}>
							Couldn't sort new events by person: {sync.peopleError}
						</div>
					)}

					<div className={s.body}>
						{/* Wait for the saved view so the page doesn't flash Week before Month. */}
						{settings.isPending ? null : view === "month" && !phone ? (
							<MonthView
								days={days}
								month={cursor.getMonth()}
								today={today}
								selected={selected}
								events={events}
								members={members}
								onSelect={setSelected}
								onOpen={(event, day) => setDialog({ day, event })}
							/>
						) : (
							<WeekView
								days={listDays}
								today={today}
								selected={selected}
								events={events}
								members={members}
								onSelect={setSelected}
								onOpen={(event, day) => setDialog({ day, event })}
								footer={view === "week" && narrow ? cards : undefined}
							/>
						)}
						{selected && (
							<DayPanel
								shown={shown}
								day={selected}
								today={today}
								members={members}
								onAdd={(day) => setDialog({ day })}
								onOpen={(event, day) => setDialog({ day, event })}
								onClose={() => setSelected(null)}
							/>
						)}
					</div>
					{view === "week" && !narrow && !settings.isPending && cards}
					</>)}
				</div>
			</div>

			{dialog && (
				<EventDialog
					key={dialog.event?.id ?? dialog.day}
					day={dialog.day}
					event={dialog.event}
					members={members}
					onSave={save}
					onDelete={remove}
					onClose={() => setDialog(null)}
					canEditSynced={!!sync?.canWrite}
				/>
			)}

			{taskDialog && (
				<TaskDialog
					key={taskDialog.task?.id ?? taskDialog.memberId ?? "new"}
					task={taskDialog.task}
					memberId={
						taskDialog.memberId ??
						// One person picked: new tasks start out as theirs.
						(focus.length === 1 ? (focus[0] === EVERYONE ? null : focus[0]) : undefined)
					}
					blank={taskDialog.blank}
					members={members}
					onSave={saveTaskInput}
					onDelete={removeTask}
					onClose={() => setTaskDialog(null)}
				/>
			)}

			{showMembers && (
				<MembersPanel
					members={members}
					uiScale={uiScale}
					onClose={() => setShowMembers(false)}
				/>
			)}

			{/* The round + at the bottom right: add an event or a task. */}
			{page === "calendar" && <Fab label="Add event" onClick={() => setDialog({ day: newEventDay() })} />}
			{/* Add a task, for no one in particular yet (each kid's card has its own Add a task). */}
			{page === "tasks" && <Fab label="Add a task" onClick={() => setTaskDialog({ blank: true })} />}
			{saver.on && (
				<ScreenSaver
					photos={saver.photos}
					settings={saver.settings}
					onClose={saver.hide}
					onOpenEvent={(event, day) => {
						saver.hide();
						setPage("calendar");
						setDialog({ day, event });
					}}
				/>
			)}
			{cheer.cheer && <Celebration cheer={cheer.cheer} onDone={cheer.done} />}
			{/* "Time to leave" alerts, on whichever page is showing (above the screen saver too). */}
			<LeaveAlerts />

			{toast && <Toast message={toast} onDone={closeToast} />}
		</>
	);
}
