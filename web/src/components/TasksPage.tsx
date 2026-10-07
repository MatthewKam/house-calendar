import { useMemo, useState, type CSSProperties } from "react";
import { addDays, dayKey, fromDayKey, startOfWeek } from "../lib/dates";
import {
	useTasks,
	useTasksDone,
	useDeleteTask,
	useSetTaskDone,
	useTaskPoints,
	useReorderTasks,
	useRewards,
	useRewardActions,
} from "../lib/queries";
import {
	taskProgress,
	tasksFor,
	didTask,
	percent,
	categoryLabel,
	TIMES,
} from "../lib/tasks";
import type { Task, Member, Reward } from "../lib/types";
import SortableList from "./SortableList";
import RewardDialog from "./RewardDialog";
import ConfirmDialog from "./ConfirmDialog";
import { GiftIcon, GripIcon, PencilIcon, StarIcon, TrashIcon } from "./icons";
import panel from "../styles/DayPanel.module.css";
import s from "../styles/Tasks.module.css";

interface Props {
	today: string;
	members: Member[];
	/** Header filter (unused here: every kid with tasks is shown). */
	focus: string | null;
	onAdd: (memberId?: string) => void;
	onEdit: (task: Task) => void;
}

type Period = "week" | "month";

/**
 * The Tasks page (in place of the calendar): every kid's tasks for today, side by side.
 * Each card's History link swaps its checklist for a week or month report, where missed days can still be ticked.
 */
export default function TasksPage({ today, members, onAdd, onEdit }: Props) {
	const todayDate = fromDayKey(today);
	const thisWeek = useMemo(() => startOfWeek(fromDayKey(today)), [today]);

	// ---- Today ------------------------------------------------------------------
	const tasks = useTasks().data ?? [];
	const done = useTasksDone(thisWeek).data ?? [];
	const setDone = useSetTaskDone(thisWeek);
	const deleteTask = useDeleteTask();
	const reorder = useReorderTasks();
	// The day's bar counts required tasks only; extras earn stars instead.
	const progress = taskProgress(
		tasks,
		done,
		today,
		members.map((m) => m.id),
	);
	const stars = useTaskPoints(today).data ?? [];
	const monthStars = (id: string) =>
		stars.find((p) => p.memberId === id)?.month ?? 0;
	// Rewards on the cards, and the one being added or changed in the reward sheet.
	const rewards = useRewards(today).data ?? [];
	const { give } = useRewardActions();
	const [rewardSheet, setRewardSheet] = useState<{ member: Member; reward?: Reward } | null>(null);

	// ---- History: a week or a month, paging back from the current one ------------
	// Whose card is showing its history instead of today's list.
	const [historyKid, setHistoryKid] = useState<string | null>(null);
	const [period, setPeriod] = useState<Period>("week");
	const [back, setBack] = useState(0);
	// Day picked in the month calendar, to see and fix that day's ticks.
	const [pickedDay, setPickedDay] = useState<string | null>(null);
	function openHistory(id: string | null) {
		setHistoryKid(id);
		setPeriod("week");
		setBack(0);
		setPickedDay(null);
	}
	const range = useMemo(() => {
		if (period === "week")
			return { from: addDays(thisWeek, -7 * back), days: 7 };
		const day = fromDayKey(today);
		const from = new Date(day.getFullYear(), day.getMonth() - back, 1);
		return {
			from,
			days: new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate(),
		};
	}, [period, back, thisWeek, today]);
	const rangeDays = useMemo(
		() => Array.from({ length: range.days }, (_, i) => addDays(range.from, i)),
		[range],
	);
	const shownDone = useTasksDone(range.from, range.days).data ?? [];
	const setShownDone = useSetTaskDone(range.from, range.days);
	const short = (d: Date) =>
		d.toLocaleDateString([], { month: "short", day: "numeric" });
	const rangeLabel =
		period === "week"
			? back === 0
				? "This week"
				: back === 1
					? "Last week"
					: `${short(rangeDays[0])} – ${short(rangeDays[6])}`
			: range.from.toLocaleDateString([], { month: "long", year: "numeric" });

	// ---- Editing --------------------------------------------------------------------
	// Edit mode lists every task with edit and delete, and hides the tick buttons so nothing gets ticked by accident.
	const [editing, setEditing] = useState(false);
	// The trash button asks in a pop-up first, since deleting also removes the task's history.
	const [toDelete, setToDelete] = useState<Task | null>(null);
	/** A group (one kid's morning, say) was dragged into a new order: slot it back among all tasks. */
	function reorderGroup(groupIds: string[]) {
		const all = tasks.map((t) => t.id);
		const inGroup = new Set(groupIds);
		let next = 0;
		reorder.mutate(all.map((id) => (inGroup.has(id) ? groupIds[next++] : id)));
	}

	// Due on its weekdays, from the day it was added (earlier days aren't missed, it didn't exist yet).
	const dueOn = (c: Task, d: Date) =>
		c.days.includes(d.getDay()) && dayKey(d) >= dayKey(new Date(c.createdAt));
	// Marks tasks everyone does; editing or deleting one changes it for the whole family.
	const shared = (c: Task) =>
		c.memberId ? null : <span className={s.sharedTag}>Everyone</span>;
	// A task's icon (if any) and title.
	const named = (c: Task) => (
		<>
			{c.icon && (
				<span className={s.taskIcon} aria-hidden="true">
					{c.icon}
				</span>
			)}
			{c.title}
		</>
	);
	// Category, plus the stars an extra is worth.
	const tags = (c: Task) => (
		<>
			{shared(c)}
			<span className={s.catTag}>{categoryLabel(c.category)}</span>
			{!c.required && (
				<span className={s.starTag} aria-label={`${c.points} stars`}>
					{c.points}
					<StarIcon className={s.star} />
				</span>
			)}
		</>
	);
	// Everyone has the shared tasks, so with any of those every member gets a card.
	const kids = members.filter((m) => tasksFor(tasks, m.id).length > 0);

	const kidHeader = (kid: Member, showHistory: boolean) => {
		const p = progress.get(kid.id);
		const pct = percent(p);
		const earned = monthStars(kid.id);
		const mine = rewards.filter((r) => r.memberIds.includes(kid.id));
		return (
			<header className={s.kidHead}>
				<div className={s.head}>
					{/* Fills with their color as far as they've got through today's required tasks. */}
					<span className={`${s.namePill} ${pct === 100 ? s.nameDone : ""}`}>
						{kid.name}
						{pct === 100 && " ✓"}
					</span>
					<span className={`${s.progress} ${pct === 100 ? s.allDone : ""}`}>
						{!p
							? "Nothing required today"
							: pct === 100
								? "All done! 🎉"
								: `${p.done} of ${p.due} today`}
					</span>
					<button
						className={s.historyLink}
						aria-expanded={showHistory}
						onClick={() => openHistory(showHistory ? null : kid.id)}
					>
						{showHistory ? "← Today" : "History"}
					</button>
				</div>
				<div className={s.starsLine}>
					<StarIcon className={s.star} />
					<span>
						<b>{earned}</b> this month
					</span>
				</div>
				{/* The kid's rewards and how close their stars are to each. Tap one to change it. */}
				{mine.map((r) => {
					const reached = r.status !== "in_progress";
					// A team reward names the others it's shared with.
					const others = members.filter((m) => m.id !== kid.id && r.memberIds.includes(m.id)).map((m) => m.name);
					return (
						<div key={r.id} className={`${s.reward} ${reached ? s.rewardReached : ""}`}>
							<button className={s.rewardMain} onClick={() => setRewardSheet({ member: kid, reward: r })}>
								<GiftIcon />
								<span className={s.rewardText}>
									{r.status === "earned" ? `${r.title} earned! 🎉` : r.status === "given" ? `${r.title} ✓` : r.title}
									<span className={s.rewardMode}>
										{r.mode === "monthly" ? (r.status === "given" ? "given this month" : "this month") : "until earned"}
										{others.length > 0 && ` · with ${others.join(" & ")}`}
									</span>
								</span>
								{/* Pooled or alone: everyone's stars; each-reaches: this kid's own. */}
								{(() => {
									const n = r.teamMode === "each" && r.memberIds.length > 1 ? (r.memberStars[kid.id] ?? 0) : r.stars;
									return (
										<>
											<span className={s.rewardBar} aria-hidden="true">
												<span style={{ width: `${Math.min(100, (n / r.goal) * 100)}%` }} />
											</span>
											<span className={s.rewardCount}>
												{Math.min(n, r.goal)}/{r.goal}
											</span>
										</>
									);
								})()}
							</button>
							{/* Earned: waiting to be handed over. */}
							{r.status === "earned" && (
								<button className={s.given} onClick={() => give.mutate({ id: r.id, today })}>
									Mark as given
								</button>
							)}
						</div>
					);
				})}
				<button className={s.addReward} onClick={() => setRewardSheet({ member: kid })}>
					+ {mine.length ? "Add another reward" : "Add a reward"}
				</button>
			</header>
		);
	};

	/** Tick or untick in the history range (missed days can be fixed). */
	const toggleShown = (c: Task, kid: Member, day: string, ticked: boolean) =>
		setShownDone.mutate({ taskId: c.id, memberId: kid.id, day, done: !ticked });

	const todayList = (kid: Member) => {
		const mine = tasksFor(tasks, kid.id);
		const dueToday = mine.filter((c) => dueOn(c, todayDate));
		if (editing) {
			// By part of the day; drag a row by its handle to reorder it within that part.
			return (
				<>
					{TIMES.map((t) => {
						const group = mine.filter((c) => c.time === t.id);
						if (group.length === 0) return null;
						return (
							<div key={t.label} className={s.timeGroup}>
								<h3 className={s.timeHead}>{t.label}</h3>
								<SortableList
									items={group}
									getId={(c) => c.id}
									onReorder={reorderGroup}
									className={s.editList}
									draggingClass={s.dragging}
								>
									{(c, handle) => (
										<div className={s.editRow}>
											<span className={s.grip} {...handle}>
												<GripIcon />
											</span>
											<span className={s.editTitle}>
												{named(c)} {tags(c)}
											</span>
											<div>
												<button
													className={s.iconButton}
													onClick={() => onEdit(c)}
													aria-label={`Edit ${c.title}`}
												>
													<PencilIcon />
												</button>
												<button
													className={`${s.iconButton} ${s.trash}`}
													onClick={() => setToDelete(c)}
													aria-label={`Delete ${c.title}`}
												>
													<TrashIcon />
												</button>
											</div>
										</div>
									)}
								</SortableList>
							</div>
						);
					})}
				</>
			);
		}
		return (
			<>
				{/* By part of the day: Morning, Anytime, Evening. */}
				{TIMES.map((t) => {
					const group = dueToday.filter((c) => c.time === t.id);
					if (group.length === 0) return null;
					return (
						<div key={t.label} className={s.timeGroup}>
							<h3 className={s.timeHead}>{t.label}</h3>
							<ul className={s.today}>
								{group.map((c) => {
									const ticked = didTask(done, c, kid.id, today);
									return (
										<li key={c.id}>
											<button
												className={`${s.task} ${ticked ? s.ticked : ""} ${c.required ? "" : s.extra}`}
												aria-pressed={ticked}
												onClick={() =>
													setDone.mutate({
														taskId: c.id,
														memberId: kid.id,
														day: today,
														done: !ticked,
													})
												}
											>
												<span className={s.box} aria-hidden="true">
													{ticked ? "✓" : ""}
												</span>
												<span className={s.taskTitle}>{named(c)}</span>
												{tags(c)}
											</button>
										</li>
									);
								})}
							</ul>
						</div>
					);
				})}
				{dueToday.length === 0 && <p className={s.none}>Nothing due today.</p>}
			</>
		);
	};

	/** Week: one row per task with a dot for each day, and how many due days were done. */
	const weekTable = (kid: Member) => {
		const mine = tasksFor(tasks, kid.id);
		const cols = { "--cols": rangeDays.length } as CSSProperties;
		return (
			<div className={s.history}>
				<div className={`${s.historyRow} ${s.historyHead}`}>
					<span />
					<span className={s.cells} style={cols}>
						{rangeDays.map((d) => (
							<span key={dayKey(d)}>
								{d.toLocaleDateString([], { weekday: "narrow" })}
							</span>
						))}
					</span>
					<span className={s.count}>Done</span>
				</div>
				{mine.map((c) => {
					const due = rangeDays.filter(
						(d) => dueOn(c, d) && dayKey(d) <= today,
					);
					const doneCount = due.filter((d) =>
						didTask(shownDone, c, kid.id, dayKey(d)),
					).length;
					return (
						<div key={c.id} className={s.historyRow}>
							<button
								className={s.taskName}
								onClick={() => onEdit(c)}
								title="Change this task"
							>
								{named(c)}
							</button>
							<span className={s.cells} style={cols}>
								{rangeDays.map((d) => {
									const key = dayKey(d);
									if (!dueOn(c, d)) {
										return (
											<span
												key={key}
												className={s.notDue}
												aria-label={`${key}: not due`}
											>
												·
											</span>
										);
									}
									const ticked = didTask(shownDone, c, kid.id, key);
									const future = key > today;
									const state = ticked
										? s.cellDone
										: future
											? s.cellLater
											: key === today
												? s.cellToday
												: s.cellMissed;
									return (
										<button
											key={key}
											className={`${s.cell} ${state}`}
											disabled={future}
											aria-label={`${c.title}, ${d.toLocaleDateString([], { weekday: "long" })}: ${ticked ? "done" : future ? "coming up" : "not done"}`}
											onClick={() => toggleShown(c, kid, key, ticked)}
										>
											{ticked ? "✓" : ""}
										</button>
									);
								})}
							</span>
							<span className={s.count}>
								{due.length ? `${doneCount}/${due.length}` : "–"}
							</span>
						</div>
					);
				})}
			</div>
		);
	};

	/**
	 * Month: a calendar. Each day fills with the kid's color as far as its required tasks were done,
	 * shows a ✓ when all were, and the stars earned. Tap a day to see (and fix) its tasks.
	 */
	const monthCalendar = (kid: Member) => {
		const mine = tasksFor(tasks, kid.id);
		const blanks = range.from.getDay();
		const weekdays = Array.from({ length: 7 }, (_, i) =>
			addDays(startOfWeek(range.from), i).toLocaleDateString([], {
				weekday: "narrow",
			}),
		);
		const picked = pickedDay ? fromDayKey(pickedDay) : null;
		const pickedTasks = picked ? mine.filter((c) => dueOn(c, picked)) : [];
		return (
			<>
				<div className={s.monthGrid}>
					{weekdays.map((w, i) => (
						<span key={i} className={s.monthDow}>
							{w}
						</span>
					))}
					{Array.from({ length: blanks }, (_, i) => (
						<span key={`b${i}`} />
					))}
					{rangeDays.map((d) => {
						const key = dayKey(d);
						const required = mine.filter((c) => c.required && dueOn(c, d));
						const doneReq = required.filter((c) =>
							didTask(shownDone, c, kid.id, key),
						).length;
						const earned = shownDone
							.filter((x) => x.memberId === kid.id && x.day === key)
							.reduce((sum, x) => sum + (x.points ?? 0), 0);
						const future = key > today;
						const pct = required.length
							? Math.round((doneReq / required.length) * 100)
							: 0;
						const complete = required.length > 0 && doneReq === required.length;
						return (
							<button
								key={key}
								className={`${s.monthDay} ${future ? s.monthFuture : ""} ${key === today ? s.monthToday : ""} ${pickedDay === key ? s.monthPicked : ""} ${complete ? s.monthComplete : ""}`}
								style={{ "--fill": `${pct}%` } as CSSProperties}
								disabled={future}
								aria-label={`${d.toLocaleDateString([], { month: "long", day: "numeric" })}: ${required.length ? `${doneReq} of ${required.length} required done` : "nothing required"}${earned ? `, ${earned} stars` : ""}`}
								onClick={() => setPickedDay(pickedDay === key ? null : key)}
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
				{picked && (
					<div className={s.dayDetail}>
						<h3 className={s.timeHead}>
							{picked.toLocaleDateString([], {
								weekday: "long",
								month: "long",
								day: "numeric",
							})}
						</h3>
						{pickedTasks.length === 0 && (
							<p className={s.none}>Nothing was due.</p>
						)}
						<ul className={s.today}>
							{pickedTasks.map((c) => {
								const ticked = didTask(shownDone, c, kid.id, pickedDay!);
								return (
									<li key={c.id}>
										<button
											className={`${s.task} ${ticked ? s.ticked : ""} ${c.required ? "" : s.extra}`}
											aria-pressed={ticked}
											onClick={() => toggleShown(c, kid, pickedDay!, ticked)}
										>
											<span className={s.box} aria-hidden="true">
												{ticked ? "✓" : ""}
											</span>
											<span className={s.taskTitle}>{named(c)}</span>
											{tags(c)}
										</button>
									</li>
								);
							})}
						</ul>
					</div>
				)}
			</>
		);
	};

	return (
		<section className={s.page} aria-label="Tasks">
			<header className={s.pageHead}>
				<div>
					<h1 className={s.pageTitle}>Tasks</h1>
					<div className={panel.dow}>
						{todayDate.toLocaleDateString([], {
							weekday: "long",
							month: "long",
							day: "numeric",
						})}
					</div>
				</div>
			</header>

			<div className={s.scroll}>
				{tasks.length === 0 && (
					<p className={s.none}>
						No tasks yet. Add one for each kid and pick the days it's due; they
						tick it off here.
					</p>
				)}
				<div className={s.board}>
					{kids.map((kid) => {
						const pct = percent(progress.get(kid.id));
						const showHistory = historyKid === kid.id;
						return (
							<section
								key={kid.id}
								// While showing history the card takes the full width, so a whole month fits.
								className={`${s.kid} ${showHistory ? s.wide : ""}`}
								style={{ "--c": kid.color, "--p": `${pct}%` } as CSSProperties}
							>
								{kidHeader(kid, showHistory)}
								{showHistory ? (
									<>
										<div className={s.historyTools}>
											<div
												className={s.periods}
												role="group"
												aria-label="History period"
											>
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
											<span className={s.rangeLabel}>{rangeLabel}</span>
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
										{period === "week" ? weekTable(kid) : monthCalendar(kid)}
										<p className={s.tip}>
											{period === "week"
												? "Forgot one? Tap a dashed day to mark it done."
												: "Tap a day to see its tasks and fix any that were missed."}
										</p>
									</>
								) : (
									<>
										{todayList(kid)}
										{!editing && (
											<button
												className={s.addText}
												onClick={() => onAdd(kid.id)}
											>
												+ Add a task
											</button>
										)}
									</>
								)}
							</section>
						);
					})}
				</div>
			</div>

			{deleteTask.isError && (
				<p className={s.problem}>Couldn't delete: {deleteTask.error.message}</p>
			)}
			{/* Bottom bar: add a task for anyone, or switch on edit mode. */}
			<div className={s.actions}>
				{tasks.length > 0 && (
					<button
						className={s.editToggle}
						aria-pressed={editing}
						onClick={() => setEditing(!editing)}
					>
						{editing ? "Done editing" : "Edit tasks"}
					</button>
				)}
			</div>

			{toDelete && (
				<ConfirmDialog
					title={`Delete "${toDelete.title}"?`}
					confirmLabel={toDelete.memberId ? "Delete" : "Delete for everyone"}
					onCancel={() => setToDelete(null)}
					onConfirm={() => {
						deleteTask.mutate(toDelete.id);
						setToDelete(null);
					}}
				>
					{toDelete.memberId
						? "Its ticks and any stars it earned will be removed too. This can't be undone."
						: "This task is shared, so it's removed for everyone, with all their ticks and stars. This can't be undone."}
				</ConfirmDialog>
			)}

			{rewardSheet && (
				<RewardDialog
					key={rewardSheet.reward?.id ?? rewardSheet.member.id}
					member={rewardSheet.member}
					reward={rewardSheet.reward}
					today={today}
					onClose={() => setRewardSheet(null)}
				/>
			)}
		</section>
	);
}
