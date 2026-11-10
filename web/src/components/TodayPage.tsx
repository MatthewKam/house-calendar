import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
	addDays,
	dayKey,
	fromDayKey,
	startOfWeek,
	timeLabel,
} from "../lib/dates";
import {
	useBuckets,
	useMoments,
	useOutbox,
	useRangeEvents,
	useLists,
	useReminders,
	useRewardHistory,
	useTasks,
	useTasksDone,
	useMembers,
	useTravelTimes,
	useWeather,
} from "../lib/queries";
import { grownUpKindWordsFor, quoteFor } from "../lib/grownUpWords";
import {
	birthdays,
	sleepsUntil,
	specialDaysBetween,
	type SpecialDay,
} from "../lib/specialDays";
import { sky } from "../lib/weather";
import { useNow } from "../lib/useNow";
import { useMediaQuery } from "../lib/useMediaQuery";
import { momentKind } from "../lib/moments";
import { dueLabel, isDue, isLate } from "../lib/lists";
import { percent, taskProgress, tasksFor } from "../lib/tasks";
import type { CalEvent, Member } from "../lib/types";
import type { Page } from "./NavBar";
import { DayCalendar } from "./DayCarousel";
import ForecastCard from "./ForecastCard";
import PhotoCard from "./PhotoCard";
import MomentDialog from "./MomentDialog";
import { StarIcon } from "./icons";
import s from "../styles/Today.module.css";

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

const isKid = (m: Member) => m.stage !== null && m.stage !== "adult";
/** Be there this many minutes before it starts, for parking and walking in (as server/travel.ts plans). */
const ARRIVE_EARLY_MINUTES = 10;
/** The calendar's days: today, tomorrow and the rest of the week. */
const WEEK = 7;
/** Special days this far ahead, and at most this many of them. */
const SPECIAL_DAYS_AHEAD = 60;
const SPECIAL_DAYS_SHOWN = 6;
/** A tablet on its side, or anything bigger: the calendar in a column of its own on the right. */
const TWO_COLUMNS = "(orientation: landscape) and (min-width: 1000px)";

/** "Good morning", "Good afternoon" or "Good evening". */
function greeting(now: Date) {
	const h = now.getHours();
	return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
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
	const weather = useWeather().data;

	// The week ahead: today, tomorrow and the five days after.
	const events = useRangeEvents(day, WEEK).data ?? [];
	const ended = (e: CalEvent) =>
		e.allDay ? e.end <= today : Date.parse(e.end) <= now.getTime();
	const onDay = (e: CalEvent, d: string) =>
		e.allDay ? e.start <= d && e.end > d : dayKey(new Date(e.start)) === d;
	const sorted = [...events].sort((a, b) =>
		a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1,
	);
	const todays = sorted.filter((e) => onDay(e, today));
	const upNext = todays.filter((e) => !ended(e));
	const earlier = todays.filter(ended);
	const tomorrows = sorted.filter((e) => onDay(e, dayKey(addDays(day, 1))));
	// The rest of the week, day by day (an all-day event over several days: once, on its first).
	const shown = new Set([...todays, ...tomorrows].map((e) => e.id));
	const restOfWeek = Array.from({ length: WEEK - 2 }, (_, i) =>
		dayKey(addDays(day, i + 2)),
	)
		.map((key) => {
			const on = sorted.filter((e) => onDay(e, key) && !shown.has(e.id));
			on.forEach((e) => shown.add(e.id));
			return { key, events: on };
		})
		.filter((d) => d.events.length > 0);
	const drives = useTravelTimes(upNext.map((e) => e.id)).data ?? {};

	// The kids: today's tasks, stickers and stars.
	const kids = members.filter(isKid);
	const tasks = useTasks().data ?? [];
	const thisWeek = useMemo(() => startOfWeek(day), [today]); // eslint-disable-line react-hooks/exhaustive-deps
	const done = useTasksDone(thisWeek).data ?? [];
	const progress = taskProgress(
		tasks,
		done,
		today,
		kids.map((k) => k.id),
	);
	const moments = useMoments(today).data ?? [];
	const buckets = useBuckets().data ?? [];
	const [catching, setCatching] = useState(false);

	// Needs you: only what's waiting.
	const outbox = useOutbox().data;
	const toHandOver = (useRewardHistory().data ?? []).filter(
		(w) => !w.givenAt && !w.missedOn,
	);
	const own = useLists().data ?? [];
	// Reminders due now (or late) on Sprig's lists, for me or for anyone.
	const due = own.flatMap((l) =>
		l.items.filter(
			(i) =>
				!i.done &&
				i.due &&
				isDue(i.due, now) &&
				(!me || !i.memberId || i.memberId === me),
		),
	);
	const lists = [...own, ...(useReminders().data?.lists ?? [])]
		.map((l) => ({
			title: l.title,
			open: l.items.filter((i) => !i.done).length,
		}))
		.filter((l) => l.open > 0);
	const clashes = outbox?.conflicts.length ?? 0;
	const needs = clashes + toHandOver.length + due.length + lists.length;

	const who = (e: CalEvent) =>
		e.memberIds.length === 0
			? []
			: members.filter((m) => e.memberIds.includes(m.id));
	const when = (e: CalEvent) =>
		e.allDay
			? "All day"
			: `${timeLabel(e.start)}${e.end ? ` – ${timeLabel(e.end)}` : ""}`;

	const eventRow = (e: CalEvent, showLeave: boolean) => {
		const people = who(e);
		const drive = drives[e.id];
		const leaveAt =
			showLeave && !e.allDay && drive
				? new Date(
						Date.parse(e.start) - (drive + ARRIVE_EARLY_MINUTES) * 60_000,
					)
				: null;
		const soon = leaveAt && leaveAt.getTime() - now.getTime() < 30 * 60_000;
		return (
			<li key={e.id}>
				<button
					type="button"
					className={s.event}
					data-busy={e.busy || undefined}
					onClick={() => onOpenEvent(e)}
					style={{ "--c": people[0]?.color ?? "var(--line)" } as CSSProperties}
				>
					<span className={s.when}>{when(e)}</span>
					<span className={s.what}>
						<span className={s.title}>{e.title}</span>
						{e.location && <span className={s.where}>{e.location}</span>}
						{people.length > 0 && (
							<span className={s.where}>
								{people.map((p) => p.name).join(", ")}
							</span>
						)}
						{/* Under the event, so the title keeps the row's width on a phone. */}
						{leaveAt && (
							<span className={`${s.leave} ${soon ? s.leaveSoon : ""}`}>
								{leaveAt.getTime() <= now.getTime()
									? "Leave now"
									: `Leave by ${timeLabel(leaveAt)}`}
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
			label: "Today",
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
							<summary className={s.subHead}>
								Earlier today ({earlier.length})
							</summary>
							{list(earlier)}
						</details>
					)}
				</>
			),
		},
		{
			label: "Tomorrow",
			body:
				tomorrows.length === 0 ? (
					<p className={s.none}>Nothing on tomorrow.</p>
				) : (
					list(tomorrows)
				),
		},
		{
			label: "Rest of the week",
			body:
				restOfWeek.length === 0 ? (
					<p className={s.none}>Nothing else this week.</p>
				) : (
					restOfWeek.map((d) => (
						<div key={d.key} className={s.weekGroup}>
							<h3 className={s.subHead}>
								{fromDayKey(d.key).toLocaleDateString([], {
									weekday: "long",
									month: "short",
									day: "numeric",
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
	const twoColumns = useMediaQuery(TWO_COLUMNS);

	// The cards. A tablet on its side and anything bigger: two columns, the calendar on the right (today,
	// then tomorrow and the rest of the week under it) with the special days under it, the rest down the
	// left. Otherwise one list.
	const calendarCard = (
		<section className={`${s.card} ${s.wide}`} aria-label="Calendar">
			<DayCalendar days={calendar} styles={s} stacked={twoColumns} />
		</section>
	);
	const weatherCard = weather && <ForecastCard weather={weather} />;
	const specialCard = <SpecialDays today={today} onAdd={onAddSpecial} />;
	const kidsCard = kids.length > 0 && (
		<section className={s.card}>
			<div className={s.cardTop}>
				<h2 className={s.cardHead}>The kids today</h2>
				{parent && (
					<button
						type="button"
						className={s.catch}
						onClick={() => setCatching(true)}
					>
						✨ Caught being good
					</button>
				)}
			</div>
			<ul className={s.kids}>
				{kids.map((k) => {
					const p = progress.get(k.id);
					const pct = percent(p);
					const stickers = moments.filter((mo) => mo.memberId === k.id);
					const stars =
						buckets.find((b) => b.memberId === k.id)?.stars ?? 0;
					const hasTasks = tasksFor(tasks, k.id).length > 0;
					return (
						<li key={k.id}>
							<button
								type="button"
								className={s.kid}
								onClick={() => onPage("tasks")}
								style={
									{ "--c": k.color, "--p": `${pct}%` } as CSSProperties
								}
							>
								<span className={s.kidName}>{k.name}</span>
								<span className={s.kidBar} aria-hidden="true">
									<span />
								</span>
								<span className={s.kidMeta}>
									{!hasTasks || !p
										? "No tasks today"
										: pct === 100
											? "All done! 🎉"
											: `${p.done} of ${p.due} tasks`}
									{stickers.length > 0 && (
										<span
											className={s.stickers}
											aria-label={`${stickers.length} caught being good`}
										>
											{stickers
												.map((mo) => momentKind(mo.kind).emoji)
												.join("")}
										</span>
									)}
									<span className={s.stars}>
										<StarIcon className={s.star} /> {stars}
									</span>
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
	const needsCard = needs > 0 && (
		<section className={s.card}>
			<h2 className={s.cardHead}>Needs you</h2>
			<ul className={s.needs}>
				{clashes > 0 && (
					<li>
						<button
							type="button"
							className={s.need}
							onClick={() => onPage("calendar")}
						>
							<span aria-hidden="true">⚠️</span>
							{clashes === 1
								? "A calendar change clashes with one made elsewhere"
								: `${clashes} calendar changes clash with ones made elsewhere`}
						</button>
					</li>
				)}
				{toHandOver.map((w) => (
					<li key={w.id}>
						<button
							type="button"
							className={s.need}
							onClick={() => onPage("rewards")}
						>
							<span aria-hidden="true">🎁</span>
							{w.title} is earned: hand it over
						</button>
					</li>
				))}
				{due.map((i) => (
					<li key={i.id}>
						<button
							type="button"
							className={s.need}
							onClick={() => onPage("lists")}
						>
							<span aria-hidden="true">⏰</span>
							<span className={s.needText}>
								{i.title}
								<span
									className={isLate(i.due!, now) ? s.late : s.dueWhen}
								>
									{dueLabel(i.due!, now)}
								</span>
							</span>
						</button>
					</li>
				))}
				{lists.map((l) => (
					<li key={l.title}>
						<button
							type="button"
							className={s.need}
							onClick={() => onPage("lists")}
						>
							<span aria-hidden="true">📝</span>
							{l.title}: {l.open} {l.open === 1 ? "item" : "items"}
						</button>
					</li>
				))}
			</ul>
		</section>
	);
	const quoteCard = (
		<section className={`${s.card} ${s.words}`} aria-label="Quote of the day">
			<h2 className={s.cardHead}>Quote of the day</h2>
			<blockquote className={s.quote}>
				<p>“{quote.text}”</p>
				<footer>{quote.by}</footer>
			</blockquote>
		</section>
	);
	const encouragementCard = (
		<section className={`${s.card} ${s.words}`} aria-label="Encouragement">
			<h2 className={s.cardHead}>Encouragement</h2>
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
						{meMember ? `, ${meMember.name.split(" ")[0]}` : ""}
					</h1>
					<div className={s.date}>
						{now.toLocaleDateString([], {
							weekday: "long",
							month: "long",
							day: "numeric",
						})}{" "}
						· <span className={s.nowrap}>{timeLabel(now)}</span>
					</div>
				</div>
				{weather && look && (
					<div
						className={s.headWeather}
						aria-label={`${weather.temp}°, feels like ${weather.feels}°, ${look.label}`}
					>
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

			{catching && (
				<MomentDialog
					kids={kids}
					today={today}
					onClose={() => setCatching(false)}
				/>
			)}
		</section>
	);
}

/** "Today", "Tomorrow", or "In 12 days". */
const countdown = (days: number) =>
	days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;

/**
 * Special days coming up (the next few, in the next two months): holidays, the family's birthdays, and
 * events marked special, each with how long until it. A grown-up can add one (a new event, marked special).
 */
function SpecialDays({ today, onAdd }: { today: string; onAdd?: () => void }) {
	const people = useMembers().data ?? [];
	const start = useMemo(() => fromDayKey(today), [today]);
	const to = dayKey(addDays(start, SPECIAL_DAYS_AHEAD));
	const events = useRangeEvents(start, SPECIAL_DAYS_AHEAD + 1).data ?? [];
	// Each special one once, on its first day.
	const special: SpecialDay[] = events
		.filter((e) => e.special && !e.busy)
		.map((e) => ({
			day: e.allDay ? e.start : dayKey(new Date(e.start)),
			name: e.title,
			picture: "⭐",
		}))
		.filter(
			(d, i, all) =>
				all.findIndex((x) => x.day === d.day && x.name === d.name) === i,
		);
	const days = specialDaysBetween(today, to, (year) => [
		...birthdays(people, year),
		...special.filter((d) => d.day.startsWith(`${year}-`)),
	]).slice(0, SPECIAL_DAYS_SHOWN);
	return (
		<section className={s.card} aria-label="Special days">
			<div className={s.cardTop}>
				<h2 className={s.cardHead}>Special days</h2>
				{onAdd && (
					<button type="button" className={s.catch} onClick={onAdd}>
						＋ Add a special day
					</button>
				)}
			</div>
			{days.length === 0 ? (
				<p className={s.none}>Nothing special in the next two months yet.</p>
			) : (
				<ul className={s.specials}>
					{days.map((d) => {
						const until = sleepsUntil(today, d.day);
						return (
							<li
								key={`${d.day}-${d.name}`}
								className={`${s.specialRow} ${until === 0 ? s.specialToday : ""}`}
							>
								<span className={s.specialPicture} aria-hidden="true">
									{d.picture}
								</span>
								<span className={s.what}>
									<span className={s.title}>{d.name}</span>
									<span className={s.where}>
										{fromDayKey(d.day).toLocaleDateString([], {
											weekday: "short",
											month: "short",
											day: "numeric",
										})}
									</span>
								</span>
								<span className={s.countdown}>{countdown(until)}</span>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
