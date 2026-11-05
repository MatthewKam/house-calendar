import { percent, type Progress } from "../lib/tasks";
import { momentKind } from "../lib/moments";
import type { Goal, Member, Moment } from "../lib/types";
import { StarIcon } from "./icons";
import s from "../styles/Tasks.module.css";
import m from "../styles/Moments.module.css";
import g from "../styles/Goals.module.css";

interface Props {
	kid: Member;
	/** Today's required tasks and how many are done (none due: undefined). */
	progress?: Progress;
	/** Stars in their bucket, still to put in jars (on the Rewards page). */
	stars: number;
	showHistory: boolean;
	onHistory: () => void;
	/** Today's moments for this kid, shown as stickers. */
	moments: Moment[];
	/** Parents: catch a new moment (absent while locked). */
	onCatch?: () => void;
	/** Parents: take a moment back (tapped by mistake). */
	onRemoveMoment?: (moment: Moment) => void;
	/** Goals this kid is working on. */
	goals: Goal[];
	/** Parents: a goal tapped, to mark it done. */
	onGoal?: (goal: Goal) => void;
	/** Parents: open the kid's goals, to add or remove some. */
	onGoals?: () => void;
}

/** The top of a kid's card: name and today's progress, and the stars in their bucket. */
export default function KidHeader({ kid, progress: p, stars, showHistory, onHistory, moments, onCatch, onRemoveMoment, goals, onGoal, onGoals }: Props) {
	const pct = percent(p);
	return (
		<header className={s.kidHead}>
			<div className={s.head}>
				{/* Fills with their color as far as they've got through today's required tasks. */}
				<span className={`${s.namePill} ${pct === 100 ? s.nameDone : ""}`}>
					{kid.name}
					{pct === 100 && " ✓"}
				</span>
				<span className={`${s.progress} ${pct === 100 ? s.allDone : ""}`}>
					{!p ? "Nothing required today" : pct === 100 ? "All done! 🎉" : `${p.done} of ${p.due} today`}
				</span>
				<button className={s.historyLink} aria-expanded={showHistory} onClick={onHistory}>
					{showHistory ? "← Today" : "History"}
				</button>
			</div>
			<div className={s.starsLine}>
				<StarIcon className={s.star} />
				<span>
					<b>{stars}</b> {stars === 1 ? "star" : "stars"} to spend
				</span>
			</div>
			{(moments.length > 0 || onCatch) && (
				<div className={m.row}>
					{moments.map((mo) => {
						const k = momentKind(mo.kind);
						const label = `${k.label}${mo.note ? `: ${mo.note}` : ""}`;
						return onRemoveMoment ? (
							<button key={mo.id} type="button" className={m.sticker} title={label} aria-label={`${label}. Tap to take it back`}
								onClick={() => confirm(`Take back this ${k.label.toLowerCase()} moment?`) && onRemoveMoment(mo)}>
								{k.emoji}
							</button>
						) : (
							<span key={mo.id} className={m.sticker} title={label} role="img" aria-label={label}>{k.emoji}</span>
						);
					})}
					{onCatch && (
						<button type="button" className={m.catch} onClick={onCatch}>
							✨ Caught being good
						</button>
					)}
				</div>
			)}
			{(goals.length > 0 || onGoals) && (
				<div className={g.row} aria-label="Working on">
					{goals.map((goal) =>
						onGoal ? (
							<button key={goal.id} type="button" className={g.goal} onClick={() => onGoal(goal)}
								aria-label={`Working on: ${goal.title}. Tap when they've got it`}>
								<span className={g.goalEmoji} aria-hidden="true">{goal.emoji}</span>
								{goal.title}
							</button>
						) : (
							<span key={goal.id} className={g.goal}>
								<span className={g.goalEmoji} aria-hidden="true">{goal.emoji}</span>
								{goal.title}
							</span>
						),
					)}
					{onGoals && (
						<button type="button" className={g.goalsButton} onClick={onGoals}>
							🎯 {goals.length ? "Goals" : "Add a goal"}
						</button>
					)}
				</div>
			)}
		</header>
	);
}
