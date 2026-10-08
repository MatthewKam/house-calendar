import { fromDayKey } from "../lib/dates";
import { didTask, dueOn, expired, TIMES } from "../lib/tasks";
import type { Member, Task, TaskDone } from "../lib/types";
import SortableList from "./SortableList";
import { TaskName, TaskTags, TaskTick } from "./TaskBits";
import { GripIcon, PencilIcon, TrashIcon } from "./icons";
import s from "../styles/Tasks.module.css";

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
}

/** A kid's tasks for today by part of the day, or (editing) all of them, in order. */
export default function TodayList({ kid, tasks, done, today, editing, onTick, onEdit, onDelete, onReorder }: Props) {
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
		</>
	);
}
