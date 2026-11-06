import { useMemo, useState, type CSSProperties } from "react";
import { addDays, dayKey, fromDayKey, startOfWeek, timeLabel } from "../lib/dates";
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
	useTravelTimes,
	useWeather,
} from "../lib/queries";
import { momentKind } from "../lib/moments";
import { dueLabel, isDue, isLate } from "../lib/lists";
import { percent, taskProgress, tasksFor } from "../lib/tasks";
import type { CalEvent, Member } from "../lib/types";
import type { Page } from "./NavBar";
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
}

const isKid = (m: Member) => m.stage !== null && m.stage !== "adult";
/** Be there this many minutes before it starts, for parking and walking in (as server/travel.ts plans). */
const ARRIVE_EARLY_MINUTES = 10;

/** "Good morning", "Good afternoon" or "Good evening". */
function greeting(now: Date) {
	const h = now.getHours();
	return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * Today (phones open on it): what's next for me, how the kids are doing, and what needs me. On the
 * wall, or with no one signed in, it's the whole family's day.
 */
export default function TodayPage({ today, members, me, parent, onPage, onOpenEvent }: Props) {
	const now = new Date();
	const day = fromDayKey(today);
	const meMember = members.find((m) => m.id === me) ?? null;
	const weather = useWeather().data;

	// Today and tomorrow, so the evening still shows what's first tomorrow.
	const events = useRangeEvents(day, 2).data ?? [];
	const mine = (e: CalEvent) => !me || e.memberIds.length === 0 || e.memberIds.includes(me);
	const ended = (e: CalEvent) => (e.allDay ? e.end <= today : Date.parse(e.end) <= now.getTime());
	const onDay = (e: CalEvent, d: string) =>
		e.allDay ? e.start <= d && e.end > d : dayKey(new Date(e.start)) === d;
	const sorted = [...events].sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
	const upNext = sorted.filter((e) => onDay(e, today) && !ended(e) && mine(e));
	const tomorrow = dayKey(addDays(day, 1));
	const firstTomorrow = sorted.find((e) => onDay(e, tomorrow) && mine(e) && !e.allDay) ?? sorted.find((e) => onDay(e, tomorrow) && mine(e));
	const later = me ? sorted.filter((e) => onDay(e, today) && !ended(e) && !mine(e)) : [];
	const drives = useTravelTimes(upNext.map((e) => e.id)).data ?? {};

	// The kids: today's tasks, stickers and stars.
	const kids = members.filter(isKid);
	const tasks = useTasks().data ?? [];
	const thisWeek = useMemo(() => startOfWeek(day), [today]); // eslint-disable-line react-hooks/exhaustive-deps
	const done = useTasksDone(thisWeek).data ?? [];
	const progress = taskProgress(tasks, done, today, kids.map((k) => k.id));
	const moments = useMoments(today).data ?? [];
	const buckets = useBuckets().data ?? [];
	const [catching, setCatching] = useState(false);

	// Needs you: only what's waiting.
	const outbox = useOutbox().data;
	const toHandOver = (useRewardHistory().data ?? []).filter((w) => !w.givenAt && !w.missedOn);
	const own = useLists().data ?? [];
	// Reminders due now (or late) on Sprig's lists, for me or for anyone.
	const due = own.flatMap((l) => l.items.filter((i) => !i.done && i.due && isDue(i.due, now) && (!me || !i.memberId || i.memberId === me)));
	const lists = [...own, ...(useReminders().data?.lists ?? [])]
		.map((l) => ({ title: l.title, open: l.items.filter((i) => !i.done).length })).filter((l) => l.open > 0);
	const clashes = outbox?.conflicts.length ?? 0;
	const needs = clashes + toHandOver.length + due.length + lists.length;

	const who = (e: CalEvent) =>
		e.memberIds.length === 0 ? [] : members.filter((m) => e.memberIds.includes(m.id));
	const when = (e: CalEvent) =>
		e.allDay ? "All day" : `${timeLabel(e.start)}${e.end ? ` – ${timeLabel(e.end)}` : ""}`;

	const eventRow = (e: CalEvent, showLeave: boolean) => {
		const people = who(e);
		const drive = drives[e.id];
		const leaveAt = showLeave && !e.allDay && drive ? new Date(Date.parse(e.start) - (drive + ARRIVE_EARLY_MINUTES) * 60_000) : null;
		const soon = leaveAt && leaveAt.getTime() - now.getTime() < 30 * 60_000;
		return (
			<li key={e.id}>
				<button type="button" className={s.event} data-busy={e.busy || undefined} onClick={() => onOpenEvent(e)}
					style={{ "--c": people[0]?.color ?? "var(--line)" } as CSSProperties}>
					<span className={s.when}>{when(e)}</span>
					<span className={s.what}>
						<span className={s.title}>{e.title}</span>
						{e.location && <span className={s.where}>{e.location}</span>}
						{people.length > 0 && <span className={s.where}>{people.map((p) => p.name).join(", ")}</span>}
						{/* Under the event, so the title keeps the row's width on a phone. */}
						{leaveAt && (
							<span className={`${s.leave} ${soon ? s.leaveSoon : ""}`}>
								{leaveAt.getTime() <= now.getTime() ? "Leave now" : `Leave by ${timeLabel(leaveAt)}`}
							</span>
						)}
					</span>
				</button>
			</li>
		);
	};

	return (
		<section className={s.page} aria-label="Today">
			<header className={s.head}>
				<h1 className={s.hello}>
					{greeting(now)}
					{meMember ? `, ${meMember.name.split(" ")[0]}` : ""}
				</h1>
				<div className={s.date}>
					{day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
					{weather && ` · ${weather.temp}°, high ${weather.high}° low ${weather.low}°`}
				</div>
			</header>

			<div className={s.scroll}>
				<section className={s.card}>
					<h2 className={s.cardHead}>{me ? "Up next for you" : "Up next"}</h2>
					{upNext.length === 0 ? (
						<p className={s.none}>Nothing else today.</p>
					) : (
						<ul className={s.events}>{upNext.map((e) => eventRow(e, true))}</ul>
					)}
					{firstTomorrow && (
						<>
							<h3 className={s.subHead}>First tomorrow</h3>
							<ul className={s.events}>{eventRow(firstTomorrow, false)}</ul>
						</>
					)}
				</section>

				{kids.length > 0 && (
					<section className={s.card}>
						<div className={s.cardTop}>
							<h2 className={s.cardHead}>The kids today</h2>
							{parent && (
								<button type="button" className={s.catch} onClick={() => setCatching(true)}>
									✨ Caught being good
								</button>
							)}
						</div>
						<ul className={s.kids}>
							{kids.map((k) => {
								const p = progress.get(k.id);
								const pct = percent(p);
								const stickers = moments.filter((mo) => mo.memberId === k.id);
								const stars = buckets.find((b) => b.memberId === k.id)?.stars ?? 0;
								const hasTasks = tasksFor(tasks, k.id).length > 0;
								return (
									<li key={k.id}>
										<button type="button" className={s.kid} onClick={() => onPage("tasks")}
											style={{ "--c": k.color, "--p": `${pct}%` } as CSSProperties}>
											<span className={s.kidName}>{k.name}</span>
											<span className={s.kidBar} aria-hidden="true"><span /></span>
											<span className={s.kidMeta}>
												{!hasTasks || !p ? "No tasks today" : pct === 100 ? "All done! 🎉" : `${p.done} of ${p.due} tasks`}
												{stickers.length > 0 && (
													<span className={s.stickers} aria-label={`${stickers.length} caught being good`}>
														{stickers.map((mo) => momentKind(mo.kind).emoji).join("")}
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
				)}

				{needs > 0 && (
					<section className={s.card}>
						<h2 className={s.cardHead}>Needs you</h2>
						<ul className={s.needs}>
							{clashes > 0 && (
								<li>
									<button type="button" className={s.need} onClick={() => onPage("calendar")}>
										<span aria-hidden="true">⚠️</span>
										{clashes === 1 ? "A calendar change clashes with one made elsewhere" : `${clashes} calendar changes clash with ones made elsewhere`}
									</button>
								</li>
							)}
							{toHandOver.map((w) => (
								<li key={w.id}>
									<button type="button" className={s.need} onClick={() => onPage("rewards")}>
										<span aria-hidden="true">🎁</span>
										{w.title} is earned: hand it over
									</button>
								</li>
							))}
							{due.map((i) => (
								<li key={i.id}>
									<button type="button" className={s.need} onClick={() => onPage("lists")}>
										<span aria-hidden="true">⏰</span>
										<span className={s.needText}>
											{i.title}
											<span className={isLate(i.due!, now) ? s.late : s.dueWhen}>{dueLabel(i.due!, now)}</span>
										</span>
									</button>
								</li>
							))}
							{lists.map((l) => (
								<li key={l.title}>
									<button type="button" className={s.need} onClick={() => onPage("lists")}>
										<span aria-hidden="true">📝</span>
										{l.title}: {l.open} {l.open === 1 ? "item" : "items"}
									</button>
								</li>
							))}
						</ul>
					</section>
				)}

				{later.length > 0 && (
					<details className={s.card}>
						<summary className={s.cardHead}>The rest of the family today ({later.length})</summary>
						<ul className={s.events}>{later.map((e) => eventRow(e, false))}</ul>
					</details>
				)}
			</div>

			{catching && <MomentDialog kids={kids} today={today} onClose={() => setCatching(false)} />}
		</section>
	);
}
