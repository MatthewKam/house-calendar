import { fromDayKey } from "../lib/dates";
import { didTask, dueOn, expired, TIMES } from "../lib/tasks";
import type { Goal, Member, Task, TaskDone } from "../lib/types";
import SortableList from "./SortableList";
import { TaskName, TaskTags, TaskTick } from "./TaskBits";
import { GripIcon, PencilIcon, StarIcon, TrashIcon } from "./icons";
import s from "../styles/Tasks.module.css";
import gs from "../styles/Goals.module.css";

interface Props {
	kid: Member;
	/** The kid's tasks (their own and everyone's). */
	tasks: Task[];
	done: TaskDone[];
	today: string;
	/** Edit mode: every task, to reorder, change or delete, with no tick buttons. */
	editing: boolean;
	onTick: (task: Task, ticked: boolean) => void;
	onEdit: (task: Task) => void;
	onDelete: (task: Task) => void;
	/** A group (one part of the day) was dragged into a new order. */
	onReorder: (ids: string[]) => void;
	/** Goals the kid is working on: their own section, after the parts of the day. */
	goals: Goal[];
	/** Parents: a goal ticked, to confirm they've got it. */
	onGoal?: (goal: Goal) => void;
	/** Parents: open the kid's goals, to add, remove or see the done ones. */
	onGoals?: () => void;
}

/** A kid's tasks for today by part of the day, or (editing) all of them, in order. */
export default function TodayList({ kid, tasks, done, today, editing, onTick, onEdit, onDelete, onReorder, goals, onGoal, onGoals }: Props) {
	if (editing) {
		// Drag a row by its handle to reorder it within its part of the day.
		return (
			<>
				{TIMES.map((t) => {
					const group = tasks.filter((c) => c.time === t.id && !expired(c, today));
					if (group.length === 0) return null;
					return (
						<div key={t.label} className={s.timeGroup}>
							<h3 className={s.timeHead}>{t.label}</h3>
							<SortableList items={group} getId={(c) => c.id} onReorder={onReorder} className={s.editList} draggingClass={s.dragging}>
								{(c, handle) => (
									<div className={s.editRow}>
										<span className={s.grip} {...handle}>
											<GripIcon />
										</span>
										<span className={s.editTitle}>
											<TaskName task={c} /> <TaskTags task={c} />
										</span>
										<div>
											<button className={s.iconButton} onClick={() => onEdit(c)} aria-label={`Edit ${c.title}`}>
												<PencilIcon />
											</button>
											<button className={`${s.iconButton} ${s.trash}`} onClick={() => onDelete(c)} aria-label={`Delete ${c.title}`}>
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
	const dueToday = tasks.filter((c) => dueOn(c, fromDayKey(today), kid.id));
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
										<TaskTick task={c} ticked={ticked} onToggle={() => onTick(c, ticked)} />
									</li>
								);
							})}
						</ul>
					</div>
				);
			})}
			{dueToday.length === 0 && <p className={s.none}>Nothing due today.</p>}
			{/* Goals: worked on over time, no deadline. Ticking one is a parent saying they've got it. */}
			{(goals.length > 0 || onGoals) && (
				<div className={s.timeGroup}>
					<h3 className={s.timeHead}>Goals</h3>
					{goals.length > 0 && (
						<ul className={s.today}>
							{goals.map((g) => (
								<li key={g.id}>
									<button className={`${s.task} ${s.extra}`} disabled={!onGoal} onClick={() => onGoal?.(g)}
										aria-label={`Goal: ${g.title}. Tap when they've got it`}>
										<span className={s.box} aria-hidden="true" />
										<span className={s.taskTitle}>
											<span className={s.taskIcon} aria-hidden="true">{g.emoji}</span>
											{g.title}
										</span>
										<span className={`${s.catTag} ${gs.goalTag}`}>Goal</span>
										{g.points > 0 && (
											<span className={s.starTag} aria-label={`${g.points} stars`}>
												{g.points}
												<StarIcon className={s.star} />
											</span>
										)}
									</button>
								</li>
							))}
						</ul>
					)}
					{onGoals && (
						<button className={s.addText} onClick={onGoals}>
							{goals.length ? "See goals" : "+ Add a goal"}
						</button>
					)}
				</div>
			)}
		</>
	);
}
