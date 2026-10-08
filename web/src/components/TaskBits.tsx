import { dayKey, fromDayKey } from "../lib/dates";
import { categoryLabel } from "../lib/tasks";
import type { Task } from "../lib/types";
import { StarIcon } from "./icons";
import s from "../styles/Tasks.module.css";

/** A task's icon (if any) and title. */
export function TaskName({ task }: { task: Task }) {
	return (
		<>
			{task.icon && (
				<span className={s.taskIcon} aria-hidden="true">
					{task.icon}
				</span>
			)}
			{task.title}
		</>
	);
}

/** Its tags: Everyone (a shared task), its category, and the stars an extra is worth. */
export function TaskTags({ task }: { task: Task }) {
	return (
		<>
			{/* Editing or deleting a shared task changes it for the whole family. */}
			{!task.memberId && <span className={s.sharedTag}>Everyone</span>}
			<span className={s.catTag}>{categoryLabel(task.category)}</span>
			{/* One-time: when it's gone from the list. */}
			{task.dueBy && (
				<span className={`${s.catTag} ${s.dueTag}`}>
					{task.dueBy === dayKey(new Date())
						? "Today only"
						: `By ${fromDayKey(task.dueBy).toLocaleDateString([], { weekday: "short" })}`}
				</span>
			)}
			{!task.required && (
				<span className={s.starTag} aria-label={`${task.points} stars`}>
					{task.points}
					<StarIcon className={s.star} />
				</span>
			)}
		</>
	);
}

/** A task to tick off (today's list, or a day picked in History). */
export function TaskTick({ task, ticked, onToggle }: { task: Task; ticked: boolean; onToggle: () => void }) {
	return (
		<button className={`${s.task} ${ticked ? s.ticked : ""} ${task.required ? "" : s.extra}`} aria-pressed={ticked} onClick={onToggle}>
			<span className={s.box} aria-hidden="true">
				{ticked ? "✓" : ""}
			</span>
			<span className={s.taskTitle}>
				<TaskName task={task} />
			</span>
			<TaskTags task={task} />
		</button>
	);
}
