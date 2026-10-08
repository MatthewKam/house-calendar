import { useMemo, useState, type CSSProperties } from "react";
import { fromDayKey, startOfWeek } from "../lib/dates";
import {
	useTasks,
	useTasksDone,
	useDeleteTask,
	useSetTaskDone,
	useReorderTasks,
	useBuckets,
} from "../lib/queries";
import { taskProgress, tasksFor, percent } from "../lib/tasks";
import type { Task, Member } from "../lib/types";
import KidHeader from "./KidHeader";
import TodayList from "./TodayList";
import TaskHistory from "./TaskHistory";
import ConfirmDialog from "./ConfirmDialog";
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

/**
 * The Tasks page (in place of the calendar): every kid's tasks for today, side by side.
 * Each card's History link swaps its checklist for a week or month report, where missed days can still be ticked.
 */
export default function TasksPage({ today, members, onAdd, onEdit }: Props) {
	const thisWeek = useMemo(() => startOfWeek(fromDayKey(today)), [today]);
	const tasks = useTasks().data ?? [];
	const done = useTasksDone(thisWeek).data ?? [];
	const setDone = useSetTaskDone(thisWeek);
	const deleteTask = useDeleteTask();
	const reorder = useReorderTasks();
	// The day's bar counts required tasks only; extras earn stars instead.
	const progress = taskProgress(tasks, done, today, members.map((m) => m.id));
	const buckets = useBuckets().data ?? [];
	// Whose card is showing its history instead of today's list (one at a time).
	const [historyKid, setHistoryKid] = useState<string | null>(null);
	// Edit mode lists every task with edit and delete, and hides the tick buttons so nothing gets ticked by accident.
	const [editing, setEditing] = useState(false);
	// The trash button asks in a pop-up first, since deleting also removes the task's history.
	const [toDelete, setToDelete] = useState<Task | null>(null);

	/** A group (one kid's morning, say) was dragged into a new order: slot it back among all tasks. */
	function reorderGroup(groupIds: string[]) {
		const inGroup = new Set(groupIds);
		let next = 0;
		reorder.mutate(tasks.map((t) => (inGroup.has(t.id) ? groupIds[next++] : t.id)));
	}

	// Everyone has the shared tasks, so with any of those every member gets a card.
	const kids = members.filter((m) => tasksFor(tasks, m.id).length > 0);

	return (
		<section className={s.page} aria-label="Tasks">
			<header className={s.pageHead}>
				<div>
					<h1 className={s.pageTitle}>Tasks</h1>
					<div className={panel.dow}>
						{fromDayKey(today).toLocaleDateString([], {
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
						const mine = tasksFor(tasks, kid.id);
						const showHistory = historyKid === kid.id;
						return (
							<section
								key={kid.id}
								// While showing history the card takes the full width, so a whole month fits.
								className={`${s.kid} ${showHistory ? s.wide : ""}`}
								style={{ "--c": kid.color, "--p": `${percent(progress.get(kid.id))}%` } as CSSProperties}
							>
								<KidHeader
									kid={kid}
									progress={progress.get(kid.id)}
									stars={buckets.find((b) => b.memberId === kid.id)?.stars ?? 0}
									showHistory={showHistory}
									onHistory={() => setHistoryKid(showHistory ? null : kid.id)}
								/>
								{showHistory ? (
									<TaskHistory kid={kid} tasks={mine} today={today} onEdit={onEdit} />
								) : (
									<>
										<TodayList
											kid={kid}
											tasks={mine}
											done={done}
											today={today}
											editing={editing}
											onTick={(c, ticked) => setDone.mutate({ taskId: c.id, memberId: kid.id, day: today, done: !ticked })}
											onEdit={onEdit}
											onDelete={setToDelete}
											onReorder={reorderGroup}
										/>
										{!editing && (
											<button className={s.addText} onClick={() => onAdd(kid.id)}>
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

			{/* Bottom bar: switch on edit mode. */}
			<div className={s.actions}>
				{tasks.length > 0 && (
					<button className={s.editToggle} aria-pressed={editing} onClick={() => setEditing(!editing)}>
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
						? "Its ticks and any stars it earned will be removed too (out of jars, if they're in one). This can't be undone."
						: "This task is shared, so it's removed for everyone, with all their ticks and stars. This can't be undone."}
				</ConfirmDialog>
			)}
		</section>
	);
}
