import { useState, type FormEvent } from "react";
import { addDays, startOfWeek } from "../lib/dates";
import { UNASSIGNED } from "../lib/color";
import { CATEGORIES, QUICK_TASKS, TASK_ICONS, TIMES } from "../lib/tasks";
import type {
	Task,
	TaskCategory,
	TaskInput,
	TaskTime,
	Member,
} from "../lib/types";
import ConfirmDialog from "./ConfirmDialog";
import IconPicker from "./IconPicker";
import { PickChip } from "./NameChip";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/EventDialog.module.css";
import c from "../styles/Tasks.module.css";

interface Props {
	task?: Task;
	/** Who to preselect for a new task: a member, or null for everyone. */
	memberId?: string | null;
	/** A new task with no one picked yet (from the round +): Who has to be chosen. */
	blank?: boolean;
	members: Member[];
	onSave: (input: TaskInput) => void;
	onDelete: (task: Task) => void;
	onClose: () => void;
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const PRESETS: [string, number[]][] = [
	["Every day", EVERY_DAY],
	["Weekdays", [1, 2, 3, 4, 5]],
	["Weekends", [0, 6]],
];

// One letter per weekday in the display's language, Sunday first.
const sunday = startOfWeek(new Date());
const LETTERS = EVERY_DAY.map((d) =>
	addDays(sunday, d).toLocaleDateString([], { weekday: "short" }),
);

export default function TaskDialog({
	task,
	memberId: preset,
	blank,
	members,
	onSave,
	onDelete,
	onClose,
}: Props) {
	// The parent remounts this dialog for each open, so initial state is enough.
	const [title, setTitle] = useState(task?.title ?? "");
	// null means everyone: each person gets the task and ticks off their own. undefined: not picked yet.
	const [memberId, setMemberId] = useState<string | null | undefined>(
		task
			? task.memberId
			: blank
				? undefined
				: preset !== undefined
					? preset
					: (members[0]?.id ?? null),
	);
	const [days, setDays] = useState<number[]>(task?.days ?? EVERY_DAY);
	const [time, setTime] = useState<TaskTime | null>(task?.time ?? null);
	const [icon, setIcon] = useState<string | null>(task?.icon ?? null);
	const [category, setCategory] = useState<TaskCategory>(
		task?.category ?? "non_negotiable",
	);
	const [required, setRequired] = useState(task?.required ?? true);
	const [points, setPoints] = useState(
		task && !task.required ? task.points : 1,
	);
	// Daily is always required and Bonus never is; Chores follow the switch.
	const isRequired =
		category === "non_negotiable"
			? true
			: category === "bonus"
				? false
				: required;
	// Delete asks in a confirmation pop-up first.
	const [confirmDelete, setConfirmDelete] = useState(false);

	const problem = !title.trim()
		? "Add a task"
		: memberId === undefined
			? "Pick who it's for"
		: days.length === 0
			? "Pick at least one day"
			: null;
	const same = (a: number[], b: number[]) =>
		a.length === b.length && a.every((d) => b.includes(d));

	function submit(e: FormEvent) {
		e.preventDefault();
		if (!problem) {
			onSave({
				title: title.trim(),
				memberId: memberId ?? null,
				days: [...days].sort(),
				time,
				category,
				required: isRequired,
				points: isRequired ? 0 : points,
				icon,
			});
		}
	}

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={sheet.sheet} onSubmit={submit}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>{task ? "Edit task" : "New task"}</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
						×
					</button>
				</header>

				<div className={c.titleRow}>
					{/* The chosen icon, shown before the name like on the Tasks page. */}
					<span className={c.iconPreview} aria-hidden="true">
						{icon ?? "·"}
					</span>
					<input
						className={s.title}
						placeholder="What needs doing?"
						value={title}
						maxLength={80}
						autoFocus={!task}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</div>
				{!task && (
					<div className={s.wrap}>
						{QUICK_TASKS.map((q) => (
							<button
								key={q.title}
								type="button"
								className={s.chip}
								onClick={() => {
									setTitle(q.title);
									setIcon(q.icon);
								}}
							>
								{q.icon} {q.title}
							</button>
						))}
					</div>
				)}

				<div className={s.label}>Icon</div>
				<IconPicker value={icon} onChange={setIcon} featured={TASK_ICONS} />

				<div className={s.label}>Who</div>
				<div className={s.wrap}>
					{[...members, { id: null, name: "Everyone", color: UNASSIGNED }].map(
						(m) => (
							<PickChip
								key={m.id ?? "everyone"}
								name={m.name}
								color={m.color}
								on={memberId === m.id}
								onClick={() => setMemberId(m.id)}
							/>
						),
					)}
				</div>
				{memberId === null && (
					<p className={c.hint}>
						Everyone gets this task and ticks off their own.
					</p>
				)}

				<div className={s.label}>Days</div>
				<div className={s.wrap}>
					{PRESETS.map(([label, set]) => (
						<button
							key={label}
							type="button"
							className={`${s.chip} ${same(days, set) ? c.chipOn : ""}`}
							onClick={() => setDays(set)}
						>
							{label}
						</button>
					))}
				</div>
				<div className={c.dayPicker} role="group" aria-label="Days it's due">
					{LETTERS.map((label, d) => {
						const on = days.includes(d);
						return (
							<button
								key={d}
								type="button"
								aria-pressed={on}
								className={`${c.dayToggle} ${on ? c.dayOn : ""}`}
								onClick={() =>
									setDays(on ? days.filter((x) => x !== d) : [...days, d])
								}
							>
								{label}
							</button>
						);
					})}
				</div>

				<div className={s.label}>Time of day</div>
				<div className={s.wrap}>
					{TIMES.map((t) => (
						<button
							key={t.label}
							type="button"
							aria-pressed={time === t.id}
							className={`${s.chip} ${time === t.id ? c.chipOn : ""}`}
							onClick={() => setTime(t.id)}
						>
							{t.label}
						</button>
					))}
				</div>

				<div className={s.label}>Category</div>
				<div className={s.wrap}>
					{CATEGORIES.map((k) => (
						<button
							key={k.id}
							type="button"
							aria-pressed={category === k.id}
							title={k.hint}
							className={`${s.chip} ${category === k.id ? c.chipOn : ""}`}
							onClick={() => setCategory(k.id)}
						>
							{k.label}
						</button>
					))}
				</div>

				{/* Required tasks fill the day's bar; extras earn points instead. */}
				<div className={c.requiredRow}>
					<label className={s.toggle}>
						<input
							type="checkbox"
							checked={isRequired}
							disabled={category === "non_negotiable" || category === "bonus"}
							onChange={(e) => setRequired(e.target.checked)}
						/>
						Required
					</label>
					{!isRequired && (
						<label className={c.points}>
							Stars
							<input
								type="number"
								min={0}
								max={1000}
								inputMode="numeric"
								value={points}
								onChange={(e) =>
									setPoints(
										Math.max(
											0,
											Math.min(1000, Math.round(Number(e.target.value) || 0)),
										),
									)
								}
							/>
						</label>
					)}
				</div>
				<p className={c.hint}>
					{category === "non_negotiable"
						? "Daily tasks are always required: they count toward finishing the day."
						: category === "bonus"
							? "Bonus tasks are extras: they earn stars toward this month's reward."
							: isRequired
								? "Counts toward finishing the day."
								: "An extra: earns stars towards a reward."}
				</p>

				{problem && title && <div className={s.problem}>{problem}</div>}

				<div className={sheet.actions}>
					{task && (
						<button
							type="button"
							className={sheet.danger}
							onClick={() => setConfirmDelete(true)}
						>
							Delete
						</button>
					)}
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className={sheet.primary} disabled={!!problem}>
						Save
					</button>
				</div>
			</form>
			{task && confirmDelete && (
				<ConfirmDialog
					title={`Delete "${task.title}"?`}
					confirmLabel={task.memberId ? "Delete" : "Delete for everyone"}
					onCancel={() => setConfirmDelete(false)}
					onConfirm={() => onDelete(task)}
				>
					{task.memberId
						? "Its ticks and any stars it earned will be removed too. This can't be undone."
						: "This task is shared, so it's removed for everyone, with all their ticks and stars. This can't be undone."}
				</ConfirmDialog>
			)}
		</>
	);
}
