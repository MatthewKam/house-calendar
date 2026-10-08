import { percent, type Progress } from "../lib/tasks";
import type { Member } from "../lib/types";
import { StarIcon } from "./icons";
import s from "../styles/Tasks.module.css";

interface Props {
	kid: Member;
	/** Today's required tasks and how many are done (none due: undefined). */
	progress?: Progress;
	/** Stars in their bucket, still to put in jars (on the Rewards page). */
	stars: number;
	showHistory: boolean;
	onHistory: () => void;
}

/** The top of a kid's card: name and today's progress, and the stars in their bucket. */
export default function KidHeader({ kid, progress: p, stars, showHistory, onHistory }: Props) {
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
		</header>
	);
}
