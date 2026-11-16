import { fromDayKey } from '../../lib/dates';
import { didTask, dueOn, expired, TIMES } from '../../lib/tasks';
import type { Member, Task, TaskDone } from '../../lib/types';
import SortableList from '../ui/SortableList';
import { TaskName, TaskTags, TaskTick } from './TaskBits';
import { GripIcon, PencilIcon, TrashIcon } from '../ui/icons';
import s from './Tasks.module.css';

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
	/** Whether a group ("Morning", "Goals") is folded away, and folding or opening one. */
	folded: (group: string) => boolean;
	onFold: (group: string, folded: boolean) => void;
}

/** Required tasks by part of the day, then goals in their own section. */
const GROUPS: { label: string; has: (c: Task) => boolean }[] = [
	...TIMES.map((t) => ({ label: t.label, has: (c: Task) => c.required && c.time === t.id })),
	{ label: 'Goals', has: (c: Task) => !c.required },
];

/** The groups with something due today ("Morning", "Goals"), in order. */
export const groupsDue = (kid: Member, tasks: Task[], today: string) => {
	const due = tasks.filter((c) => dueOn(c, fromDayKey(today), kid.id));
	return GROUPS.filter((gr) => due.some(gr.has)).map((gr) => gr.label);
};

/**
 * A kid's tasks for today by part of the day, then their goals (ticked any day they do them, for
 * stars), each folding away with a tap on its heading; or (editing) all of them, in order.
 */
export default function TodayList({
	kid,
	tasks,
	done,
	today,
	editing,
	onTick,
	onEdit,
	onDelete,
	onReorder,
	folded,
	onFold,
}: Props) {
	if (editing) {
		// Drag a row by its handle to reorder it within its part of the day.
		return (
			<>
				{GROUPS.map((gr) => {
					const group = tasks.filter((c) => gr.has(c) && !expired(c, today));
					if (group.length === 0) return null;
					return (
						<div key={gr.label} className={s.timeGroup}>
							<h3 className={s.timeHead}>{gr.label}</h3>
							<SortableList
								items={group}
								getId={(c) => c.id}
								onReorder={onReorder}
								className={s.editList}
								draggingClass={s.dragging}
							>
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
											<button
												className={`${s.iconButton} ${s.trash}`}
												onClick={() => onDelete(c)}
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
	const dueToday = tasks.filter((c) => dueOn(c, fromDayKey(today), kid.id));
	return (
		<>
			{/* By part of the day: Morning, Anytime, Evening; then Goals. */}
			{GROUPS.map((gr) => {
				const group = dueToday.filter(gr.has);
				if (group.length === 0) return null;
				const shut = folded(gr.label);
				const ticked = group.filter((c) => didTask(done, c, kid.id, today)).length;
				return (
					<div key={gr.label} className={s.timeGroup}>
						<h3 className={s.timeHead}>
							<button
								type="button"
								className={s.foldHead}
								aria-expanded={!shut}
								onClick={() => onFold(gr.label, !shut)}
							>
								<span className={s.chevron} aria-hidden="true">
									{shut ? '▸' : '▾'}
								</span>
								{gr.label}
								{/* Folded: how far along it is. */}
								{shut && (
									<span className={s.foldCount}>
										· {ticked === group.length ? 'All done ✓' : `${ticked} of ${group.length}`}
									</span>
								)}
							</button>
						</h3>
						{!shut && (
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
						)}
					</div>
				);
			})}
			{dueToday.length === 0 && <p className={s.none}>Nothing due today.</p>}
		</>
	);
}
