import { percent, type Progress } from "../lib/tasks";
import type { Member, Reward } from "../lib/types";
import { GiftIcon, StarIcon } from "./icons";
import s from "../styles/Tasks.module.css";

interface Props {
	kid: Member;
	members: Member[];
	/** Today's required tasks and how many are done (none due: undefined). */
	progress?: Progress;
	/** Stars earned this month. */
	stars: number;
	/** The kid's rewards (their own and shared ones). */
	rewards: Reward[];
	showHistory: boolean;
	onHistory: () => void;
	/** Change a reward, or (without one) add a new one for this kid. */
	onReward: (reward?: Reward) => void;
	onGive: (reward: Reward) => void;
}

/** The top of a kid's card: name and today's progress, stars this month, and their rewards. */
export default function KidHeader({ kid, members, progress: p, stars, rewards, showHistory, onHistory, onReward, onGive }: Props) {
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
					<b>{stars}</b> this month
				</span>
			</div>
			{/* The kid's rewards and how close their stars are to each. Tap one to change it. */}
			{rewards.map((r) => {
				// A team reward names the others it's shared with.
				const others = members.filter((m) => m.id !== kid.id && r.memberIds.includes(m.id)).map((m) => m.name);
				// Pooled or alone: everyone's stars; each-reaches: this kid's own.
				const n = r.teamMode === "each" && r.memberIds.length > 1 ? (r.memberStars[kid.id] ?? 0) : r.stars;
				return (
					<div key={r.id} className={`${s.reward} ${r.status !== "in_progress" ? s.rewardReached : ""}`}>
						<button className={s.rewardMain} onClick={() => onReward(r)}>
							<GiftIcon />
							<span className={s.rewardText}>
								{r.status === "earned" ? `${r.title} earned! 🎉` : r.status === "given" ? `${r.title} ✓` : r.title}
								<span className={s.rewardMode}>
									{r.mode === "monthly" ? (r.status === "given" ? "given this month" : "this month") : "until earned"}
									{others.length > 0 && ` · with ${others.join(" & ")}`}
								</span>
							</span>
							<span className={s.rewardBar} aria-hidden="true">
								<span style={{ width: `${Math.min(100, (n / r.goal) * 100)}%` }} />
							</span>
							<span className={s.rewardCount}>
								{Math.min(n, r.goal)}/{r.goal}
							</span>
						</button>
						{/* Earned: waiting to be handed over. */}
						{r.status === "earned" && (
							<button className={s.given} onClick={() => onGive(r)}>
								Mark as given
							</button>
						)}
					</div>
				);
			})}
			<button className={s.addReward} onClick={() => onReward()}>
				+ {rewards.length ? "Add another reward" : "Add a reward"}
			</button>
		</header>
	);
}
