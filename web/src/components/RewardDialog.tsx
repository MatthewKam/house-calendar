import { useState, type CSSProperties, type FormEvent } from "react";
import { useMembers, useRewardActions } from "../lib/queries";
import { textOn } from "../lib/color";
import type { Member, Reward, RewardMode, TeamMode } from "../lib/types";
import ConfirmDialog from "./ConfirmDialog";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/EventDialog.module.css";
import t from "../styles/Tasks.module.css";

interface Props {
	/** Who a new reward starts out for (e.g. the kid whose card it was added from). */
	member?: Member;
	/** The reward to change; a new one when missing. */
	reward?: Reward;
	today: string;
	onClose: () => void;
}

const MODES: { id: RewardMode; label: string; hint: string }[] = [
	{ id: "monthly", label: "Resets each month", hint: "Counts this month's stars; starts again at zero on the 1st." },
	{ id: "until_reached", label: "Until earned", hint: "Counts stars from today until the goal is reached, however long it takes." },
];

const TEAM: { id: TeamMode; label: string; hint: string }[] = [
	{ id: "pooled", label: "Stars added together", hint: "Everyone's stars count toward one goal." },
	{ id: "each", label: "Each reaches the goal", hint: "Every kid needs the stars on their own; earned when they all have." },
];

/** Add or change a reward: for one kid, or several together. */
export default function RewardDialog({ member, reward, today, onClose }: Props) {
	const members = useMembers().data ?? [];
	const { save, remove } = useRewardActions();
	const [title, setTitle] = useState(reward?.title ?? "");
	const [goal, setGoal] = useState(reward?.goal ?? 20);
	const [mode, setMode] = useState<RewardMode>(reward?.mode ?? "monthly");
	const [memberIds, setMemberIds] = useState<string[]>(reward?.memberIds ?? (member ? [member.id] : []));
	const [teamMode, setTeamMode] = useState<TeamMode>(reward?.teamMode ?? "pooled");
	const [repeats, setRepeats] = useState(reward?.repeats ?? false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const together = memberIds.length > 1;
	const names = members.filter((m) => memberIds.includes(m.id)).map((m) => m.name);
	const problem = !title.trim() ? "Name the reward" : goal < 1 ? "Pick how many stars" : !memberIds.length ? "Pick who it's for" : null;

	function toggle(id: string) {
		// Family order, so names read the same everywhere.
		setMemberIds(memberIds.includes(id) ? memberIds.filter((x) => x !== id) : members.map((m) => m.id).filter((x) => x === id || memberIds.includes(x)));
	}

	function submit(e: FormEvent) {
		e.preventDefault();
		if (problem) return;
		save.mutate(
			{
				id: reward?.id,
				reward: { memberIds, title: title.trim(), goal, mode, teamMode, repeats: mode === "until_reached" && repeats, startDay: today },
			},
		);
		// It shows straight away; the save carries on in the background.
		onClose();
	}

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={sheet.sheet} onSubmit={submit}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>{reward ? "Change reward" : "New reward"}</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
						×
					</button>
				</header>
				<input
					className={s.title}
					placeholder="What do they earn? e.g. Movie night"
					value={title}
					maxLength={80}
					autoFocus={!reward}
					onChange={(e) => setTitle(e.target.value)}
				/>

				<div className={s.label}>
					Who <span className={s.labelHint}>· pick more than one to earn it together</span>
				</div>
				<div className={s.wrap}>
					{members.map((m) => {
						const on = memberIds.includes(m.id);
						return (
							<button
								key={m.id}
								type="button"
								aria-pressed={on}
								className={`${s.person} ${on ? s.on : ""}`}
								style={{ "--c": m.color, color: on ? textOn(m.color) : undefined } as CSSProperties}
								onClick={() => toggle(m.id)}
							>
								{m.name}
							</button>
						);
					})}
				</div>
				{together && (
					<>
						<div className={s.wrap}>
							{TEAM.map((x) => (
								<button
									key={x.id}
									type="button"
									aria-pressed={teamMode === x.id}
									className={`${s.chip} ${teamMode === x.id ? t.chipOn : ""}`}
									onClick={() => setTeamMode(x.id)}
								>
									{x.label}
								</button>
							))}
						</div>
						<p className={t.hint}>
							{teamMode === "pooled"
								? `${names.join(" and ")}'s stars count toward one goal.`
								: `${names.join(" and ")} each need the stars on their own.`}
						</p>
					</>
				)}

				<label className={t.points}>
					{together && teamMode === "pooled" ? "Stars needed together" : together ? "Stars each" : "Stars needed"}
					<input
						type="number"
						min={1}
						max={100000}
						inputMode="numeric"
						value={goal}
						onChange={(e) => setGoal(Math.max(0, Math.round(Number(e.target.value) || 0)))}
					/>
				</label>
				<div className={s.label}>Counting</div>
				<div className={s.wrap}>
					{MODES.map((m) => (
						<button
							key={m.id}
							type="button"
							aria-pressed={mode === m.id}
							className={`${s.chip} ${mode === m.id ? t.chipOn : ""}`}
							onClick={() => setMode(m.id)}
						>
							{m.label}
						</button>
					))}
				</div>
				<p className={t.hint}>{MODES.find((m) => m.id === mode)?.hint}</p>
				{mode === "until_reached" && (
					<label className={s.toggle}>
						<input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} /> Start again after it's given
					</label>
				)}
				{save.isError && <div className={s.problem}>Couldn't save: {save.error.message}</div>}
				<div className={sheet.actions}>
					{reward && (
						<button type="button" className={sheet.danger} onClick={() => setConfirmDelete(true)}>
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
			{reward && confirmDelete && (
				<ConfirmDialog
					title={`Delete "${reward.title}"?`}
					confirmLabel="Delete"
					onCancel={() => setConfirmDelete(false)}
					onConfirm={() => {
						remove.mutate(reward.id);
						onClose();
					}}
				>
					The reward is removed. Stars aren't affected, and rewards already given stay in the history.
				</ConfirmDialog>
			)}
		</>
	);
}
