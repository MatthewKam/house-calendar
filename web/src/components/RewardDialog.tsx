import { useState, type FormEvent } from "react";
import { useRewardActions } from "../lib/queries";
import type { Member, Reward, RewardMode } from "../lib/types";
import ConfirmDialog from "./ConfirmDialog";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/EventDialog.module.css";
import t from "../styles/Tasks.module.css";

interface Props {
	member: Member;
	/** The reward to change; a new one when missing. */
	reward?: Reward;
	today: string;
	onClose: () => void;
}

const MODES: { id: RewardMode; label: string; hint: string }[] = [
	{ id: "monthly", label: "Resets each month", hint: "Counts this month's stars; starts again at zero on the 1st." },
	{ id: "until_reached", label: "Until earned", hint: "Counts stars from today until the goal is reached, however long it takes." },
];

/** Add or change one of a kid's rewards. */
export default function RewardDialog({ member, reward, today, onClose }: Props) {
	const { save, remove } = useRewardActions();
	const [title, setTitle] = useState(reward?.title ?? "");
	const [goal, setGoal] = useState(reward?.goal ?? 20);
	const [mode, setMode] = useState<RewardMode>(reward?.mode ?? "monthly");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const problem = !title.trim() ? "Name the reward" : goal < 1 ? "Pick how many stars" : null;

	function submit(e: FormEvent) {
		e.preventDefault();
		if (problem) return;
		save.mutate(
			{ id: reward?.id, reward: { memberId: member.id, title: title.trim(), goal, mode, startDay: today } },
			{ onSuccess: onClose },
		);
	}

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={sheet.sheet} onSubmit={submit}>
				<h2 className={sheet.heading}>{reward ? "Change reward" : `New reward for ${member.name}`}</h2>
				<input
					className={s.title}
					placeholder="What do they earn? e.g. Movie night"
					value={title}
					maxLength={80}
					autoFocus={!reward}
					onChange={(e) => setTitle(e.target.value)}
				/>
				<label className={t.points}>
					Stars needed
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
					onConfirm={() => remove.mutate(reward.id, { onSuccess: onClose })}
				>
					The reward is removed from {member.name}'s card. Their stars aren't affected.
				</ConfirmDialog>
			)}
		</>
	);
}
