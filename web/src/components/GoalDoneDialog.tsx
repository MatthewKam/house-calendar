import { useEffect, useState } from "react";
import { useGoalActions } from "../lib/queries";
import type { Goal, Member } from "../lib/types";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Goals.module.css";

interface Props {
	kid: Member;
	goal: Goal;
	today: string;
	onClose: () => void;
}

/** Parents only: a goal tapped on a kid's card. Have they got it? Then it's done, and they're cheered. */
export default function GoalDoneDialog({ kid, goal, today, onClose }: Props) {
	const { finish } = useGoalActions();
	const [note, setNote] = useState("");

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={`${sheet.sheet} ${sheet.confirm}`} role="dialog" aria-modal="true" aria-label={goal.title}
				onSubmit={(e) => {
					e.preventDefault();
					finish.mutate({ id: goal.id, day: today, note: note.trim() || undefined }, { onSuccess: onClose });
				}}>
				<div className={s.doneHead}>
					<span className={s.doneEmoji} aria-hidden="true">{goal.emoji}</span>
					<h2 className={sheet.heading}>{goal.title}</h2>
				</div>
				<p className={sheet.body}>
					Has {kid.name} got it? Take your time: there's no deadline, and it stays here until they have.
				</p>
				<input className={s.input} placeholder="How did they do it? (optional)" aria-label="Note" maxLength={300}
					value={note} onChange={(e) => setNote(e.target.value)} />
				{finish.isError && <p className={s.problem}>{finish.error.message}</p>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>Not yet</button>
					<button type="submit" className={sheet.primary} disabled={finish.isPending}>They did it! 🎉</button>
				</div>
			</form>
		</>
	);
}
