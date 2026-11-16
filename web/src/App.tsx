import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { dayKey, fromDayKey, startOfWeek } from './lib/dates';
import { useCalendarView } from './lib/useCalendarView';
import { useToday } from './lib/useToday';
import type { CalEvent, Task, TaskInput, EventInput, Scope } from './lib/types';
import {
	useTasks,
	useTasksDone,
	useDeleteTask,
	useDeleteEvent,
	useRestoreEvent,
	useSaveTask,
	useMembers,
	useSaveEvent,
	useSettings,
	useSyncStatus,
	useAuthStatus,
} from './lib/queries';
import EventDialog from './components/calendar/EventDialog';
import CalendarPage from './components/calendar/CalendarPage';
import { EVERYONE } from './components/calendar/PeopleFilter';
import TasksPage from './components/tasks/TasksPage';
import TodayPage from './components/today/TodayPage';
import NavBar, { type Page } from './components/nav/NavBar';
import LeaveAlerts from './components/calendar/LeaveAlerts';
import Fab from './components/nav/Fab';
import { usePage } from './lib/usePage';
import ListView, { AddToListSheet } from './components/lists/ListView';
import QuickAdd, { type QuickAction } from './components/nav/QuickAdd';
import MomentDialog from './components/tasks/MomentDialog';
import CaptureSheet from './components/capture/CaptureSheet';
import RewardsPage from './components/rewards/RewardsPage';
import { useScreenSaver } from './lib/useScreenSaver';
import { useWakeLock } from './lib/useWakeLock';
import { useAutoLock, useParent } from './lib/useParent';
import ParentUnlock from './components/account/ParentUnlock';
import KidModeStart from './components/kid/KidModeStart';
import GrownUpPin from './components/account/GrownUpPin';
import { useKidMode } from './lib/useKidMode';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import { useCheer } from './lib/useCheer';
import TaskDialog from './components/tasks/TaskDialog';
import { taskProgress } from './lib/tasks';
import Celebration from './components/ui/Celebration';
import Toast, { type ToastMessage } from './components/ui/Toast';
import OfflineBar from './components/ui/OfflineBar';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from './lib/useMediaQuery';
import { useFlyerDrop } from './lib/useFlyerDrop';
import ErrorBoundary from './components/ui/ErrorBoundary';
import s from './App.module.css';

// Loaded when first opened, so a phone opening the calendar doesn't download them: kid mode (with
// Learn's games), Photos, the screen saver and Settings. Each is shown inside <Suspense fallback={null}>.
const KidMode = lazy(() => import('./components/kid/KidMode'));
const PhotosPage = lazy(() => import('./components/photos/PhotosPage'));
const RecipesPage = lazy(() => import('./components/recipes/RecipesPage'));
const ScreenSaver = lazy(() => import('./components/photos/ScreenSaver'));
const Settings = lazy(() => import('./components/settings/Settings'));
import { isKid } from './lib/people';
import { useTheme } from './lib/useTheme';
import { useAccent } from './lib/accent';
import { useUiScale } from './lib/useUiScale';

/** The one sheet or dialog open over the app (one at a time: opening another closes it). */
type Open =
	/** An event: a new one on `day`, or `event`. special: a new special day, from Today. */
	| { kind: 'event'; day: string; event?: CalEvent; special?: boolean }
	/** A task: one to edit, or a kid to start a new one for (as a goal). blank: from the round +, no one picked yet. */
	| { kind: 'task'; blank?: boolean; task?: Task; memberId?: string; goal?: boolean }
	/** A guardian's PIN, then `then` (e.g. opening Settings). */
	| { kind: 'unlock'; then?: () => void }
	| { kind: 'settings' }
	| { kind: 'kidModeStart' }
	| { kind: 'kidModeLeave' }
	/** The phone's +: Add to a list, Caught being good. */
	| { kind: 'list' }
	| { kind: 'good' }
	/** Say it, or Snap a flyer (with its photo). */
	| { kind: 'capture'; photo?: File };

/** Each page, as a message names it ("Something went wrong with Tasks"). */
const PAGE_NAMES: Record<Page, string> = {
	today: 'Today',
	calendar: 'the calendar',
	tasks: 'Tasks',
	lists: 'Lists',
	rewards: 'Rewards',
	photos: 'Photos',
	recipes: 'Recipes',
};

export default function App() {
	const today = useToday();
	// The calendar's name filters (member ids, or EVERYONE): Tasks follows a single one.
	const [focus, setFocus] = useState<string[]>([]);
	const [open, setOpen] = useState<Open | null>(null);
	const close = () => setOpen(null);
	const dialog = open?.kind === 'event' ? open : null;
	const taskDialog = open?.kind === 'task' ? open : null;
	// Which page fills the main area. Kept in the address (#tasks), so a refresh stays on it.
	const [page, setPage] = usePage();
	const [toast, setToast] = useState<ToastMessage | null>(null);

	const closeToast = useCallback(() => setToast(null), []);

	const members = useMembers().data ?? [];
	const settings = useSettings();
	// This device's text size (Settings, Appearance).
	const [uiScale] = useUiScale(settings.data?.uiScale);
	const saveEvent = useSaveEvent();
	const saveTask = useSaveTask();
	const deleteTask = useDeleteTask();
	// Today's task progress per person, shown as a fill behind each name in the calendar's filters.
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

	// The month or week on screen, the day open in the panel, and moving between them.
	const calendar = useCalendarView(today);
	const { newEventDay } = calendar;
	// The phone's bar (and its +): along the bottom, or down the left with the phone on its side.
	const phone = useMediaQuery(PHONE);
	const phoneBar = useMediaQuery(PHONE_SIDEWAYS) || phone;
	// A removed person can't stay picked.
	const stale = members.length > 0 ? focus.filter((f) => f !== EVERYONE && !members.some((m) => m.id === f)) : [];
	if (stale.length) setFocus(focus.filter((f) => !stale.includes(f)));
	const sync = useSyncStatus().data;

	// Photos when the wall is idle.
	const saver = useScreenSaver();
	// The parent lock: what kids can't change. It locks itself again when idle or the screen saver starts.
	const parentLock = useParent();
	useAutoLock(saver.on);
	// Who's signed in here, shown at the bottom of the bar.
	const auth = useAuthStatus().data;
	const signedIn = auth?.signedIn ? auth : null;
	// Kid mode: turned on for this device by a parent, or a kid's own device (added by code) while it's locked.
	const [kidModeFor, setKidMode] = useKidMode();
	const kids = members.filter(isKid);
	// Photos the phone's + picked, on their way to the Photos page.
	const [pickedPhotos, setPickedPhotos] = useState<File[] | null>(null);
	// Add a recipe from the phone's +, for the Recipes page to open.
	const [addingRecipe, setAddingRecipe] = useState(false);
	// Say it, or Snap a flyer: on when the server has Claude.
	const captureOn = useQuery({ queryKey: ['capture'], queryFn: api.captureOn, staleTime: Infinity }).data?.on ?? false;
	const kidDevice =
		signedIn?.kind === 'device' && signedIn.role === 'kid' && !parentLock.parent ? signedIn.memberId : null;
	// A flyer's photo dragged onto the page is read like Snap a flyer (on Photos, a drop adds to the album).
	const takeFlyer = useCallback((photo: File) => setOpen({ kind: 'capture', photo }), []);
	const notAPhoto = useCallback(() => setToast({ text: 'Drop a photo of the flyer (a JPEG, PNG or HEIC)' }), []);
	const draggingFlyer = useFlyerDrop(
		// Not on Photos or Recipes: they take dropped pictures themselves.
		parentLock.parent &&
			captureOn &&
			!kidModeFor &&
			!kidDevice &&
			page !== 'photos' &&
			page !== 'recipes' &&
			open?.kind !== 'capture',
		takeFlyer,
		notAPhoto,
	);
	// Kid mode turned on here: every kid, to switch between, starting with the one picked. A kid's own
	// device: just them.
	const kidView = kidModeFor ? kids : kidDevice ? members.filter((m) => m.id === kidDevice) : null;
	// Light or dark, as picked in Settings (or the device's own); kid mode stays light.
	useTheme(!!kidView);
	// The wall wears the household's accent (the account holder's pick); everything else its own.
	useAccent(signedIn?.role === 'wall' && settings.data ? (settings.data.accent ?? null) : undefined);
	// Leaving: a kid's own device unlocks for a parent (and comes back when it locks again); anywhere
	// else a guardian's PIN turns it off. Never just a tap, even when every PIN has gone since it started
	// (cleared, or its guardian's account deleted): then it waits for a guardian to set one. Only a home
	// server without accounts has no PINs to ask for.
	function leaveKidMode() {
		if (!kidModeFor) setOpen({ kind: 'unlock' });
		else if (signedIn) setOpen({ kind: 'kidModeLeave' });
		else setKidMode(null);
	}
	// With the screen saver on, the screen stays on (it takes over instead of the device sleeping),
	// unless the battery is low.
	useWakeLock(saver.settings.enabled && saver.photos.length > 0);
	// Back from connecting Google Calendar (…/?calendar=connected, or what went wrong).
	useEffect(() => {
		const url = new URL(window.location.href);
		const result = url.searchParams.get('calendar');
		if (!result) return;
		url.searchParams.delete('calendar');
		history.replaceState(null, '', url.pathname + url.search + url.hash);
		setToast({
			text:
				result === 'connected'
					? 'Google Calendar connected. Its events will show in a moment.'
					: `Google Calendar: ${result}`,
		});
	}, []);

	// Any edit that couldn't be saved (it was shown straight away, and has been put back).
	useEffect(() => {
		const failed = (e: Event) => setToast({ text: `Couldn't save: ${(e as CustomEvent<string>).detail}` });
		window.addEventListener('household:save-failed', failed);
		return () => window.removeEventListener('household:save-failed', failed);
	}, []);

	useEffect(() => {
		document.documentElement.style.fontSize = `${18 * uiScale}px`;
	}, [uiScale]);

	/** Opens an event, unless it's someone else's Busy time (nothing to show). */
	function openEvent(event: CalEvent, day: string) {
		if (!event.busy) setOpen({ kind: 'event', day, event });
	}

	function save(input: EventInput) {
		const id = dialog?.event?.id;
		close();
		saveEvent.mutate({ id, input });
	}

	function saveTaskInput(input: TaskInput) {
		const id = taskDialog?.task?.id;
		close();
		saveTask.mutate({ id, input });
	}

	function removeTask(task: Task) {
		close();
		deleteTask.mutate(task.id);
	}

	function remove(ev: CalEvent, scope: Scope = 'one') {
		close();
		const synced = ev.calendarId !== 'local';
		deleteEvent.mutate(
			{ id: ev.id, scope },
			{
				onSuccess: () =>
					setToast({
						text: `Deleted “${ev.title}”${ev.repeats ? (scope === 'all' ? ' (every day)' : ' (this day)') : ''}`,
						// iCloud events wait before the delete is sent, so Undo just cancels it.
						undo: () =>
							synced
								? restoreEvent.mutate(ev.id)
								: saveEvent.mutate({
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
			},
		);
	}

	if (kidView) {
		return (
			<>
				{/* Wait for the family, so it doesn't flash "No kids yet". */}
				{members.length > 0 && (
					<ErrorBoundary what="kid mode" kind="kid" onLeave={leaveKidMode}>
						<Suspense fallback={null}>
							<KidMode
								today={today}
								kids={kidView}
								members={members}
								onLeave={leaveKidMode}
								startWith={kidModeFor ?? undefined}
								askPin={!!signedIn && signedIn.guardianPins > 0}
								ownDevice={!!kidDevice}
							/>
						</Suspense>
					</ErrorBoundary>
				)}
				{open?.kind === 'kidModeLeave' && (
					<GrownUpPin
						title="Leave kid mode"
						body={
							signedIn && signedIn.guardianPins === 0
								? 'No guardian has a PIN now. Set one on your own phone (Settings → Users), then type it here.'
								: "Type a guardian's PIN to go back to the whole app."
						}
						okLabel="Leave"
						onClose={close}
						onOk={() => {
							close();
							setKidMode(null);
						}}
					/>
				)}
				{open?.kind === 'unlock' && <ParentUnlock onClose={close} onDone={open.then} />}
				{saver.on && (
					<Suspense fallback={null}>
						<ScreenSaver
							photos={saver.photos}
							settings={saver.settings}
							onClose={saver.hide}
							onOpenEvent={saver.hide}
						/>
					</Suspense>
				)}
				{cheer.cheer && <Celebration cheer={cheer.cheer} onDone={cheer.done} />}
				{toast && <Toast message={toast} onDone={closeToast} />}
			</>
		);
	}

	// The phone's +, top of the stack first. Adding events, tasks and moments needs a parent; anyone
	// adds to a list or a photo.
	const quickActions: QuickAction[] = [
		...(parentLock.parent
			? [
					{
						kind: 'event' as const,
						onPick: () => setOpen({ kind: 'event', day: page === 'calendar' ? newEventDay() : today }),
					},
				]
			: []),
		{ kind: 'list', onPick: () => setOpen({ kind: 'list' }) },
		...(parentLock.parent && kids.length ? [{ kind: 'good' as const, onPick: () => setOpen({ kind: 'good' }) }] : []),
		...(parentLock.parent ? [{ kind: 'task' as const, onPick: () => setOpen({ kind: 'task', blank: true }) }] : []),
		// From pictures (the camera or the phone's photos) or a link: the Recipes page's own Add a recipe.
		...(parentLock.parent
			? [
					{
						kind: 'recipe' as const,
						onPick: () => {
							setAddingRecipe(true);
							setPage('recipes');
						},
					},
				]
			: []),
		{
			kind: 'photo',
			files: (files) => {
				setPickedPhotos(files);
				setPage('photos');
			},
		},
		// Nearest the thumb.
		...(parentLock.parent && captureOn
			? [
					{ kind: 'snap' as const, files: (files: File[]) => setOpen({ kind: 'capture', photo: files[0] }) },
					{ kind: 'say' as const, onPick: () => setOpen({ kind: 'capture' }) },
				]
			: []),
	];

	return (
		<>
			<div className={s.app}>
				<NavBar
					phone={phoneBar}
					center={<QuickAdd actions={quickActions} />}
					capture={
						parentLock.parent && captureOn
							? { onSay: () => setOpen({ kind: 'capture' }), onSnap: (photo) => setOpen({ kind: 'capture', photo }) }
							: undefined
					}
					page={page}
					settingsOpen={open?.kind === 'settings'}
					onPage={setPage}
					// Settings is for parents: unlock first if locked.
					onSettings={() =>
						setOpen(
							parentLock.parent ? { kind: 'settings' } : { kind: 'unlock', then: () => setOpen({ kind: 'settings' }) },
						)
					}
					lock={
						parentLock.lockable
							? {
									parent: parentLock.parent,
									by: signedIn?.unlockedBy ?? null,
									onTap: () => (parentLock.parent ? parentLock.lock.mutate() : setOpen({ kind: 'unlock' })),
								}
							: undefined
					}
				/>
				<div className={s.shell}>
					<ErrorBoundary what={PAGE_NAMES[page]} kind="page" resetKey={page}>
						{page === 'today' ? (
							<TodayPage
								today={today}
								members={members}
								me={signedIn?.memberId ?? null}
								parent={parentLock.parent}
								onPage={setPage}
								onOpenEvent={(event) => openEvent(event, event.allDay ? event.start : dayKey(new Date(event.start)))}
								onAddSpecial={
									parentLock.parent ? () => setOpen({ kind: 'event', day: today, special: true }) : undefined
								}
								onPlaySlideshow={saver.show}
							/>
						) : page === 'tasks' ? (
							<TasksPage
								today={today}
								members={members}
								focus={focus.length === 1 ? focus[0] : null}
								locked={!parentLock.parent}
								onAdd={(memberId, goal) => setOpen({ kind: 'task', memberId, goal })}
								onEdit={(task) => setOpen({ kind: 'task', task })}
							/>
						) : page === 'lists' ? (
							<ListView />
						) : page === 'rewards' ? (
							<RewardsPage today={today} members={members} />
						) : page === 'recipes' ? (
							<Suspense fallback={null}>
								<RecipesPage parent={parentLock.parent} addNow={addingRecipe} onAdding={() => setAddingRecipe(false)} />
							</Suspense>
						) : page === 'photos' ? (
							<Suspense fallback={null}>
								<PhotosPage onPreview={saver.show} incoming={pickedPhotos} onTaken={() => setPickedPhotos(null)} />
							</Suspense>
						) : (
							<CalendarPage
								today={today}
								members={members}
								tasks={tasks}
								progress={progress}
								focus={focus}
								onFocus={setFocus}
								calendar={calendar}
								onAdd={parentLock.parent ? (day) => setOpen({ kind: 'event', day }) : undefined}
								onOpen={openEvent}
								onPlaySlideshow={saver.show}
							/>
						)}
					</ErrorBoundary>
				</div>
			</div>

			{/* Pop-ups: one that breaks says so, with Close, and the page under it carries on. */}
			<ErrorBoundary
				what="this window"
				className={s.popupProblem}
				resetKey={open ?? dialog ?? taskDialog}
				retryLabel="Close"
				onRetry={close}
			>
				{dialog && (
					<EventDialog
						key={dialog.event?.id ?? `${dialog.day}${dialog.special ? '-special' : ''}`}
						day={dialog.day}
						event={dialog.event}
						special={dialog.special}
						members={members}
						onSave={save}
						onDelete={remove}
						onClose={close}
						canEditSynced={!!sync?.canWrite}
						locked={!parentLock.parent}
					/>
				)}

				{taskDialog && (
					<TaskDialog
						key={taskDialog.task?.id ?? taskDialog.memberId ?? 'new'}
						task={taskDialog.task}
						memberId={
							taskDialog.memberId ??
							// One person picked: new tasks start out as theirs.
							(focus.length === 1 ? (focus[0] === EVERYONE ? null : focus[0]) : undefined)
						}
						blank={taskDialog.blank}
						goal={taskDialog.goal}
						members={members}
						onSave={saveTaskInput}
						onDelete={removeTask}
						onClose={close}
					/>
				)}

				{open?.kind === 'unlock' && <ParentUnlock onClose={close} onDone={open.then} />}
				{open?.kind === 'kidModeStart' && (
					<KidModeStart
						kids={kids}
						needsPin={!!signedIn && signedIn.guardianPins === 0}
						onPick={(id) => {
							close();
							setKidMode(id);
						}}
						onClose={close}
					/>
				)}
				{open?.kind === 'settings' && (
					<Suspense fallback={null}>
						<Settings
							members={members}
							// Kid mode starts from Settings (Screen); a kid's own device is in it already.
							onKidMode={kids.length && signedIn?.role !== 'kid' ? () => setOpen({ kind: 'kidModeStart' }) : undefined}
							onClose={close}
						/>
					</Suspense>
				)}

				{open?.kind === 'list' && (
					<AddToListSheet
						onClose={close}
						onNewList={() => {
							close();
							setPage('lists');
						}}
					/>
				)}
				{open?.kind === 'good' && <MomentDialog kids={kids} today={today} onClose={close} />}
				{draggingFlyer && (
					<div className={s.flyerDrop} aria-live="polite">
						<span className={s.flyerDropBox}>Drop the flyer to read it</span>
					</div>
				)}
				{open?.kind === 'capture' && (
					<CaptureSheet photo={open.photo} members={members} onClose={close} onAdded={(text) => setToast({ text })} />
				)}
			</ErrorBoundary>

			{/* The round + at the bottom right: add an event or a task (phones have the bar's + instead). */}
			{/* Adding needs a parent (the lock in the left bar). */}
			{!phoneBar && page === 'calendar' && parentLock.parent && (
				<Fab label="Add event" onClick={() => setOpen({ kind: 'event', day: newEventDay() })} />
			)}
			{/* Add a task, for no one in particular yet (each kid's card has its own Add a task). */}
			{!phoneBar && page === 'tasks' && parentLock.parent && (
				<Fab label="Add a task or goal" onClick={() => setOpen({ kind: 'task', blank: true })} />
			)}
			{saver.on && (
				<Suspense fallback={null}>
					<ScreenSaver
						photos={saver.photos}
						settings={saver.settings}
						onClose={saver.hide}
						onOpenEvent={(event, day) => {
							saver.hide();
							setPage('calendar');
							openEvent(event, day);
						}}
					/>
				</Suspense>
			)}
			{cheer.cheer && <Celebration cheer={cheer.cheer} onDone={cheer.done} />}
			{/* "Time to leave" alerts, on whichever page is showing (above the screen saver too). */}
			<LeaveAlerts />
			{/* No connection: said at the top of every page (not in kid mode: nothing for them to do about it). */}
			<OfflineBar />

			{toast && <Toast message={toast} onDone={closeToast} />}
		</>
	);
}
