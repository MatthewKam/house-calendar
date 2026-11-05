import { useState, type FormEvent } from "react";
import { addDays, dayKey, fromDayKey, startOfWeek } from "../lib/dates";
import { UNASSIGNED } from "../lib/color";
import { goalsOf, MAX_GOALS, QUICK_TASKS, TASK_CATEGORIES, TASK_ICONS, TIMES } from "../lib/tasks";
import { MOMENT_KINDS } from "../lib/moments";
import { useGoalActions, useGoalLibrary, useTasks } from "../lib/queries";
import type {
	Task,
	TaskCategory,
	TaskInput,
	TaskTime,
	Member,
	MomentKind,
} from "../lib/types";
import ConfirmDialog from "./ConfirmDialog";
import GoalPicker from "./GoalPicker";
import PointsStepper from "./PointsStepper";
import g from "../styles/Goals.module.css";
import IconPicker from "./IconPicker";
import { PickChip } from "./NameChip";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/EventDialog.module.css";
import c from "../styles/Tasks.module.css";
import DateInput from "./DateInput";

interface Props {
	task?: Task;
	/** Who to preselect for a new task: a member, or null for everyone. */
	memberId?: string | null;
	/** A new task with no one picked yet (from the round +): Who has to be chosen. */
	blank?: boolean;
	/** A new one starts as a goal, not a task. */
	goal?: boolean;
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

const TODAY = () => dayKey(new Date());
/** What a new goal is worth unless changed: more than a moment, since it's a stretch. */
const GOAL_STARS = 5;
/** Quick picks for a one-time task's due date: today, tomorrow, and this Saturday. */
const DUE_PICKS = (): [string, string][] => [
	["Today", TODAY()],
	["Tomorrow", dayKey(addDays(new Date(), 1))],
	["End of week", dayKey(addDays(startOfWeek(new Date()), 6))],
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
	goal: startAsGoal,
	members,
	onSave,
	onDelete,
	onClose,
}: Props) {
	// The parent remounts this dialog for each open, so initial state is enough.
	// A task is required for the day; a goal is ticked any day they do it, for its stars.
	const [mode, setMode] = useState<"task" | "goal">(task ? (task.required ? "task" : "goal") : startAsGoal ? "goal" : "task");
	const isGoal = mode === "goal";
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
	// One-time: the last day it can be done (it's on the list until then, or until it's done).
	const [dueBy, setDueBy] = useState<string | null>(task?.dueBy ?? null);
	const [time, setTime] = useState<TaskTime | null>(task?.time ?? null);
	const [icon, setIcon] = useState<string | null>(task?.icon ?? null);
	// The icon picker opens under the name when the icon square is tapped.
	const [pickingIcon, setPickingIcon] = useState(false);
	const [category, setCategory] = useState<TaskCategory>(
		task?.required ? task.category : "non_negotiable",
	);
	const [points, setPoints] = useState(task && !task.required ? task.points : GOAL_STARS);
	// A goal picked from the list, or the activity for one of your own (saved to the list too).
	const library = useGoalLibrary().data ?? [];
	const fromList = library.find((x) => x.title.toLowerCase() === title.trim().toLowerCase());
	const [kind, setKind] = useState<MomentKind>("self_care");
	const { save: saveToList } = useGoalActions();
	// Goals on their list already: at most MAX_GOALS at once.
	const tasks = useTasks().data ?? [];
	const goalCount = memberId === undefined ? 0
		: memberId === null
			? Math.max(0, ...members.map((m) => goalsOf(tasks, m.id, TODAY(), task?.id).length))
			: goalsOf(tasks, memberId, TODAY(), task?.id).length;
	const full = isGoal && goalCount >= MAX_GOALS;
	const who = members.find((m) => m.id === memberId);
	// Delete asks in a confirmation pop-up first.
	const [confirmDelete, setConfirmDelete] = useState(false);

	const problem = !title.trim()
		? isGoal ? "Pick or name a goal" : "Add a task"
		: full
			? `That's ${MAX_GOALS} goals already`
		: memberId === undefined
			? "Pick who it's for"
		: dueBy === null && days.length === 0
			? "Pick at least one day"
		: dueBy !== null && dueBy < TODAY() && dueBy !== task?.dueBy
			? "Pick a due date from today on"
			: null;
	const same = (a: number[], b: number[]) =>
		a.length === b.length && a.every((d) => b.includes(d));

	function submit(e: FormEvent) {
		e.preventDefault();
		if (!problem) {
			// A goal of your own joins the list, for any kid, until it's hidden.
			if (isGoal && !fromList && icon) saveToList.mutate({ title: title.trim(), emoji: icon, kind });
			onSave({
				title: title.trim(),
				memberId: memberId ?? null,
				days: dueBy ? EVERY_DAY : [...days].sort(),
				time: isGoal ? null : time,
				category: isGoal ? "bonus" : category,
				required: !isGoal,
				points: isGoal ? points : 0,
				icon,
				dueBy,
			});
		}
	}

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={sheet.sheet} onSubmit={submit}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>{task ? (isGoal ? "Edit goal" : "Edit task") : isGoal ? "New goal" : "New task"}</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
						×
					</button>
				</header>

				<div className={g.modeSwitch} role="group" aria-label="Task or goal">
					<button type="button" aria-pressed={!isGoal} onClick={() => setMode("task")}>
						Task
						<span className={g.modeHint}>Required for the day</span>
					</button>
					<button type="button" aria-pressed={isGoal} onClick={() => setMode("goal")}>
						Goal
						<span className={g.modeHint}>Earns stars any day they do it</span>
					</button>
				</div>

				<div className={c.titleRow}>
					{/* The chosen icon, shown before the name like on the Tasks page. Tap to pick one. */}
					<button
						type="button"
						className={c.iconPreview}
						aria-expanded={pickingIcon}
						aria-label={icon ? "Change icon" : "Add an icon"}
						onClick={() => setPickingIcon(!pickingIcon)}
					>
						{icon ?? "+"}
					</button>
					<input
						className={s.title}
						placeholder={isGoal ? "Pick a goal below, or type your own" : "What needs doing?"}
						value={title}
						maxLength={80}
						autoFocus={!task}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</div>
				{pickingIcon && (
					<IconPicker
						value={icon}
						featured={TASK_ICONS}
						onChange={(next) => {
							setIcon(next);
							setPickingIcon(false);
						}}
					/>
				)}
				{isGoal && title.trim() && !fromList && (
					<>
						<div className={s.wrap} role="group" aria-label="Activity">
							{MOMENT_KINDS.map((k) => (
								<button key={k.kind} type="button" aria-pressed={kind === k.kind}
									className={`${s.chip} ${kind === k.kind ? c.chipOn : ""}`} onClick={() => setKind(k.kind)}>
									{k.emoji} {k.label}
								</button>
							))}
						</div>
						<p className={c.hint}>
							{icon ? "Your own goal: it joins the goal list for every kid, until you hide it." : "Tap the square to give it a picture."}
						</p>
					</>
				)}
				{isGoal && (
					<GoalPicker stage={who?.stage ?? null} picked={fromList?.key ?? null}
						onPick={(x) => {
							setTitle(x.title);
							setIcon(x.emoji);
						}} />
				)}
				{!task && !isGoal && (
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
						Everyone gets this {isGoal ? "goal" : "task"} and ticks off their own.
					</p>
				)}
				{full && (
					<p className={g.warning} role="status">
						{memberId === null ? "Someone" : who?.name} has {MAX_GOALS} goals already, the most at once. Remove one from their list to add another.
						{!fromList && icon && title.trim() ? " You can still save this one to the goal list for later." : ""}
					</p>
				)}
				{isGoal && (
					<>
						<div className={s.label}>Worth</div>
						<PointsStepper value={points} onChange={setPoints} max={50} />
					</>
				)}

				<div className={s.label}>Days</div>
				<div className={s.wrap}>
					{PRESETS.map(([label, set]) => (
						<button
							key={label}
							type="button"
							className={`${s.chip} ${dueBy === null && same(days, set) ? c.chipOn : ""}`}
							onClick={() => {
								setDays(set);
								setDueBy(null);
							}}
						>
							{label}
						</button>
					))}
					<button
						type="button"
						className={`${s.chip} ${dueBy !== null ? c.chipOn : ""}`}
						onClick={() => setDueBy(dueBy ?? TODAY())}
					>
						One time
					</button>
				</div>
				{dueBy !== null ? (
					<>
						<div className={s.wrap}>
							{DUE_PICKS().map(([label, day]) => (
								<button
									key={label}
									type="button"
									className={`${s.chip} ${dueBy === day ? c.chipOn : ""}`}
									onClick={() => setDueBy(day)}
								>
									{label}
								</button>
							))}
							<DateInput
								className={c.dueDate}
								value={dueBy}
								min={TODAY()}
								aria-label="Due by"
								onChange={(e) => e.target.value && setDueBy(e.target.value)}
							/>
						</div>
						<p className={c.hint}>
							{dueBy === TODAY()
								? "Just today: it's gone tomorrow."
								: `On the list until it's done, through ${fromDayKey(dueBy).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}. Then it's gone.`}
						</p>
					</>
				) : (
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
				)}

				{!isGoal && (
					<>
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
							{TASK_CATEGORIES.map((k) => (
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
						<p className={c.hint}>Tasks are required: they count toward finishing the day.</p>
					</>
				)}

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
					{full && !fromList && icon && title.trim() ? (
						<button type="button" className={sheet.primary} disabled={saveToList.isPending}
							onClick={() => saveToList.mutate({ title: title.trim(), emoji: icon, kind }, { onSuccess: onClose })}>
							Save to the goal list
						</button>
					) : (
						<button type="submit" className={sheet.primary} disabled={!!problem}>
							Save
						</button>
					)}
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
