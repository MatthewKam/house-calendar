import { useState, type FormEvent } from "react";
import { useMembers, useRewardActions } from "../lib/queries";
import type { Member, Reward, TeamMode } from "../lib/types";
import ConfirmDialog from "./ConfirmDialog";
import { PickChip } from "./NameChip";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/EventDialog.module.css";
import t from "../styles/Tasks.module.css";
import r from "../styles/Rewards.module.css";

interface Props {
	/** Who a new jar starts out for (e.g. the kid whose section it was added from). */
	member?: Member;
	/** The jar to change; a new one when missing. */
	reward?: Reward;
	today: string;
	onClose: () => void;
}

const TEAM: { id: TeamMode; label: string; hint: string }[] = [
	{ id: "pooled", label: "Stars added together", hint: "Everyone's stars fill one jar." },
	{ id: "each", label: "Each fills it", hint: "Every kid puts in the full amount; earned when they all have." },
];

/** Add or change a reward jar: for one kid, or several together. */
export default function RewardDialog({ member, reward, today, onClose }: Props) {
	const members = useMembers().data ?? [];
	const { save, remove } = useRewardActions();
	const [title, setTitle] = useState(reward?.title ?? "");
	const [goal, setGoal] = useState(reward?.goal ?? 20);
	const [memberIds, setMemberIds] = useState<string[]>(reward?.memberIds ?? (member ? [member.id] : []));
	const [teamMode, setTeamMode] = useState<TeamMode>(reward?.teamMode ?? "pooled");
	// Last day to redeem it, or none (it then fills again after each time it's redeemed).
	const [deadline, setDeadline] = useState<string | null>(reward?.deadline ?? null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const together = memberIds.length > 1;
	const names = members.filter((m) => memberIds.includes(m.id)).map((m) => m.name);
	const problem = !title.trim()
		? "Name the reward"
		: goal < 1
			? "Pick how many stars"
			: !memberIds.length
				? "Pick who it's for"
				: deadline !== null && deadline < today && deadline !== reward?.deadline
					? "Pick a deadline from today on"
					: null;

	function toggle(id: string) {
		// Family order, so names read the same everywhere.
		setMemberIds(memberIds.includes(id) ? memberIds.filter((x) => x !== id) : members.map((m) => m.id).filter((x) => x === id || memberIds.includes(x)));
	}

	function submit(e: FormEvent) {
		e.preventDefault();
		if (problem) return;
		save.mutate({ id: reward?.id, reward: { memberIds, title: title.trim(), goal, teamMode, deadline }, today });
		// It shows straight away; the save carries on in the background.
		onClose();
	}

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={sheet.sheet} onSubmit={submit}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>{reward ? "Change jar" : "New reward jar"}</h2>
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
							<PickChip key={m.id} name={m.name} color={m.color} on={on} onClick={() => toggle(m.id)} />
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
								? `${names.join(" and ")}'s stars fill one jar.`
								: `${names.join(" and ")} each put in the full amount.`}
						</p>
					</>
				)}

				<label className={t.points}>
					{together && teamMode === "pooled" ? "Stars to fill it, together" : together ? "Stars each" : "Stars to fill it"}
					<input
						type="number"
						min={1}
						max={100000}
						inputMode="numeric"
						value={goal}
						onChange={(e) => setGoal(Math.max(0, Math.round(Number(e.target.value) || 0)))}
					/>
				</label>
				<div className={s.label}>Deadline</div>
				<div className={s.wrap}>
					<button
						type="button"
						aria-pressed={deadline === null}
						className={`${s.chip} ${deadline === null ? t.chipOn : ""}`}
						onClick={() => setDeadline(null)}
					>
						None
					</button>
					<button
						type="button"
						aria-pressed={deadline !== null}
						className={`${s.chip} ${deadline !== null ? t.chipOn : ""}`}
						onClick={() => setDeadline(deadline ?? today)}
					>
						By a date
					</button>
					{deadline !== null && (
						<input
							type="date"
							className={r.date}
							value={deadline}
							min={today}
							aria-label="Last day to redeem it"
							onChange={(e) => e.target.value && setDeadline(e.target.value)}
						/>
					)}
				</div>
				<p className={t.hint}>
					{deadline === null
						? "After it's redeemed, it empties and can be filled again."
						: "One time only. If it isn't redeemed by then, the kids get their stars back to use on another jar."}
				</p>
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
					Stars in it go back to the kids' buckets. Rewards already redeemed stay in the history.
				</ConfirmDialog>
			)}
		</>
	);
}
