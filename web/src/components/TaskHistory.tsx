import { useMemo, useState, type CSSProperties } from "react";
import { addDays, dayKey, fromDayKey, startOfWeek } from "../lib/dates";
import { useSetTaskDone, useTasksDone } from "../lib/queries";
import { didTask, dueOn } from "../lib/tasks";
import type { Member, Task, TaskDone } from "../lib/types";
import { TaskName, TaskTick } from "./TaskBits";
import { StarIcon } from "./icons";
import s from "../styles/Tasks.module.css";

type Period = "week" | "month";

interface Props {
	kid: Member;
	/** The kid's tasks (their own and everyone's). */
	tasks: Task[];
	today: string;
	onEdit: (task: Task) => void;
}

const short = (d: Date) => d.toLocaleDateString([], { month: "short", day: "numeric" });

/**
 * A kid's history in place of today's list: a week (a row per task, a dot per day) or a month (a
 * calendar), paging back from now. Missed days can still be ticked.
 */
export default function TaskHistory({ kid, tasks, today, onEdit }: Props) {
	const [period, setPeriod] = useState<Period>("week");
	// How many weeks or months back.
	const [back, setBack] = useState(0);
	// Day picked in the month calendar, to see and fix that day's ticks.
	const [pickedDay, setPickedDay] = useState<string | null>(null);

	const range = useMemo(() => {
		const day = fromDayKey(today);
		if (period === "week") return { from: addDays(startOfWeek(day), -7 * back), days: 7 };
		const from = new Date(day.getFullYear(), day.getMonth() - back, 1);
		return { from, days: new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate() };
	}, [period, back, today]);
	const rangeDays = useMemo(() => Array.from({ length: range.days }, (_, i) => addDays(range.from, i)), [range]);
	const done = useTasksDone(range.from, range.days).data ?? [];
	const setDone = useSetTaskDone(range.from, range.days);
	const toggle = (c: Task, day: string, ticked: boolean) => setDone.mutate({ taskId: c.id, memberId: kid.id, day, done: !ticked });

	const label =
		period === "week"
			? back === 0
				? "This week"
				: back === 1
					? "Last week"
					: `${short(rangeDays[0])} – ${short(rangeDays[6])}`
			: range.from.toLocaleDateString([], { month: "long", year: "numeric" });

	return (
		<>
			<div className={s.historyTools}>
				<div className={s.periods} role="group" aria-label="History period">
					{(["week", "month"] as const).map((p) => (
						<button
							key={p}
							className={period === p ? s.periodOn : ""}
							aria-pressed={period === p}
							onClick={() => {
								setPeriod(p);
								setBack(0);
								setPickedDay(null);
							}}
						>
							{p === "week" ? "Week" : "Month"}
						</button>
					))}
				</div>
				<button
					className={s.toolButton}
					onClick={() => {
						setBack(back + 1);
						setPickedDay(null);
					}}
					aria-label={`Earlier ${period}`}
				>
					‹
				</button>
				<span className={s.rangeLabel}>{label}</span>
				<button
					className={s.toolButton}
					onClick={() => {
						setBack(back - 1);
						setPickedDay(null);
					}}
					disabled={back === 0}
					aria-label={`Later ${period}`}
				>
					›
				</button>
			</div>
			{period === "week" ? (
				<WeekTable kid={kid} tasks={tasks} today={today} days={rangeDays} done={done} onToggle={toggle} onEdit={onEdit} />
			) : (
				<MonthCalendar
					kid={kid}
					tasks={tasks}
					today={today}
					from={range.from}
					days={rangeDays}
					done={done}
					picked={pickedDay}
					onPick={setPickedDay}
					onToggle={toggle}
				/>
			)}
			<p className={s.tip}>
				{period === "week" ? "Forgot one? Tap a dashed day to mark it done." : "Tap a day to see its tasks and fix any that were missed."}
			</p>
		</>
	);
}

/** Week: one row per task with a dot for each day, and how many due days were done. */
function WeekTable({ kid, tasks, today, days, done, onToggle, onEdit }: {
	kid: Member;
	tasks: Task[];
	today: string;
	days: Date[];
	done: TaskDone[];
	onToggle: (c: Task, day: string, ticked: boolean) => void;
	onEdit: (task: Task) => void;
}) {
	const cols = { "--cols": days.length } as CSSProperties;
	return (
		<div className={s.history}>
			<div className={`${s.historyRow} ${s.historyHead}`}>
				<span />
				<span className={s.cells} style={cols}>
					{days.map((d) => (
						<span key={dayKey(d)}>{d.toLocaleDateString([], { weekday: "narrow" })}</span>
					))}
				</span>
				<span className={s.count}>Done</span>
			</div>
			{tasks.map((c) => {
				const due = days.filter((d) => dueOn(c, d, kid.id) && dayKey(d) <= today);
				const doneCount = due.filter((d) => didTask(done, c, kid.id, dayKey(d))).length;
				return (
					<div key={c.id} className={s.historyRow}>
						<button className={s.taskName} onClick={() => onEdit(c)} title="Change this task">
							<TaskName task={c} />
						</button>
						<span className={s.cells} style={cols}>
							{days.map((d) => {
								const key = dayKey(d);
								if (!dueOn(c, d, kid.id)) {
									return (
										<span key={key} className={s.notDue} aria-label={`${key}: not due`}>
											·
										</span>
									);
								}
								const ticked = didTask(done, c, kid.id, key);
								const future = key > today;
								const state = ticked ? s.cellDone : future ? s.cellLater : key === today ? s.cellToday : s.cellMissed;
								return (
									<button
										key={key}
										className={`${s.cell} ${state}`}
										disabled={future}
										aria-label={`${c.title}, ${d.toLocaleDateString([], { weekday: "long" })}: ${ticked ? "done" : future ? "coming up" : "not done"}`}
										onClick={() => onToggle(c, key, ticked)}
									>
										{ticked ? "✓" : ""}
									</button>
								);
							})}
						</span>
						<span className={s.count}>{due.length ? `${doneCount}/${due.length}` : "–"}</span>
					</div>
				);
			})}
		</div>
	);
}

/**
 * Month: a calendar. Each day fills with the kid's color as far as its required tasks were done,
 * shows a ✓ when all were, and the stars earned. Tap a day to see (and fix) its tasks.
 */
function MonthCalendar({ kid, tasks, today, from, days, done, picked, onPick, onToggle }: {
	kid: Member;
	tasks: Task[];
	today: string;
	from: Date;
	days: Date[];
	done: TaskDone[];
	picked: string | null;
	onPick: (day: string | null) => void;
	onToggle: (c: Task, day: string, ticked: boolean) => void;
}) {
	const weekdays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(from), i).toLocaleDateString([], { weekday: "narrow" }));
	const pickedDate = picked ? fromDayKey(picked) : null;
	const pickedTasks = pickedDate ? tasks.filter((c) => dueOn(c, pickedDate, kid.id)) : [];
	return (
		<>
			<div className={s.monthGrid}>
				{weekdays.map((w, i) => (
					<span key={i} className={s.monthDow}>
						{w}
					</span>
				))}
				{Array.from({ length: from.getDay() }, (_, i) => (
					<span key={`b${i}`} />
				))}
				{days.map((d) => {
					const key = dayKey(d);
					const required = tasks.filter((c) => c.required && dueOn(c, d, kid.id));
					const doneReq = required.filter((c) => didTask(done, c, kid.id, key)).length;
					const earned = done.filter((x) => x.memberId === kid.id && x.day === key).reduce((sum, x) => sum + (x.points ?? 0), 0);
					const future = key > today;
					const pct = required.length ? Math.round((doneReq / required.length) * 100) : 0;
					const complete = required.length > 0 && doneReq === required.length;
					return (
						<button
							key={key}
							className={`${s.monthDay} ${future ? s.monthFuture : ""} ${key === today ? s.monthToday : ""} ${picked === key ? s.monthPicked : ""} ${complete ? s.monthComplete : ""}`}
							style={{ "--fill": `${pct}%` } as CSSProperties}
							disabled={future}
							aria-label={`${d.toLocaleDateString([], { month: "long", day: "numeric" })}: ${required.length ? `${doneReq} of ${required.length} required done` : "nothing required"}${earned ? `, ${earned} stars` : ""}`}
							onClick={() => onPick(picked === key ? null : key)}
						>
							<span className={s.monthNum}>{d.getDate()}</span>
							{complete && <span className={s.monthCheck}>✓</span>}
							{earned > 0 && (
								<span className={s.monthStars}>
									{earned}
									<StarIcon className={s.star} />
								</span>
							)}
						</button>
					);
				})}
			</div>
			{pickedDate && (
				<div className={s.dayDetail}>
					<h3 className={s.timeHead}>{pickedDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h3>
					{pickedTasks.length === 0 && <p className={s.none}>Nothing was due.</p>}
					<ul className={s.today}>
						{pickedTasks.map((c) => {
							const ticked = didTask(done, c, kid.id, picked!);
							return (
								<li key={c.id}>
									<TaskTick task={c} ticked={ticked} onToggle={() => onToggle(c, picked!, ticked)} />
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</>
	);
}
