import { useState } from "react";
import {
	useBuckets,
	useRewardActions,
	useRewardHistory,
	useRewards,
} from "../lib/queries";
import type { Member, Reward, RewardWin } from "../lib/types";
import RewardDialog from "./RewardDialog";
import KidJars from "./KidJars";
import TakeBackDialog from "./TakeBackDialog";
import { Who, dayAndTime, shortDay, toDate } from "./JarBits";
import Fab from "./Fab";
import { useParent } from "../lib/useParent";
import s from "../styles/Rewards.module.css";

interface Props {
	today: string;
	members: Member[];
}

const monthOf = (d: string) =>
	toDate(d).toLocaleDateString([], { month: "long", year: "numeric" });

/** Rewards: each kid's stars and jars, full jars waiting to be redeemed, then everything redeemed (or missed) so far. */
export default function RewardsPage({ today, members }: Props) {
	const jars = useRewards(today).data ?? [];
	const history = useRewardHistory().data ?? [];
	const buckets = useBuckets().data ?? [];
	const { redeem, undoRedeem } = useRewardActions();
	// Parents only: the full jar whose stars are being taken back.
	const [takingBack, setTakingBack] = useState<RewardWin | null>(null);
	const [sheet, setSheet] = useState<{ reward?: Reward } | null>(null);
	// Making and changing jars needs a parent (the lock in the left bar); using them doesn't.
	const { parent } = useParent();
	const [showAll, setShowAll] = useState(false);

	const starsOf = (id: string) =>
		buckets.find((b) => b.memberId === id)?.stars ?? 0;
	const waiting = history.filter((w) => !w.givenAt && !w.missedOn);
	// Kids with stars, jars, or rewards from before.
	const kids = members.filter(
		(m) =>
			starsOf(m.id) > 0 ||
			jars.some((j) => j.memberIds.includes(m.id)) ||
			history.some((w) => w.memberIds.includes(m.id)),
	);
	const done = history.filter((w) => w.givenAt || w.missedOn);
	const shown = showAll ? done : done.slice(0, 12);
	const byMonth = shown.reduce<{ month: string; wins: RewardWin[] }[]>(
		(groups, w) => {
			const month = monthOf(w.givenAt ?? w.missedOn!);
			const last = groups.at(-1);
			if (last?.month === month) last.wins.push(w);
			else groups.push({ month, wins: [w] });
			return groups;
		},
		[],
	);

	return (
		<section className={s.page} aria-label="Rewards">
			<header className={s.pageHead}>
				<div>
					<h1 className={s.pageTitle}>Rewards</h1>
				</div>
			</header>

			<div className={s.scroll}>
				{kids.length === 0 ? (
					<p className={s.none}>
						No reward jars yet. Tap + to make one; kids fill them with the stars
						they earn from extras.
					</p>
				) : (
					<div className={s.kids}>
						{kids.map((kid) => (
							<KidJars
								key={kid.id}
								kid={kid}
								members={members}
								today={today}
								bucket={starsOf(kid.id)}
								jars={jars.filter(
									(j) => j.status !== "earned" && j.memberIds.includes(kid.id),
								)}
								onEdit={parent ? (reward) => setSheet({ reward }) : undefined}
							/>
						))}
					</div>
				)}

				<h2 className={s.section}>Earned 🎉</h2>
				{waiting.length === 0 ? (
					<p className={s.none}>Full jars wait here to be redeemed.</p>
				) : (
					<ul className={s.givenList}>
						{waiting.map((w) => (
							<li key={w.id} className={s.earned}>
								<span className={s.givenTitle}>🎁 {w.title}</span>
								<Who ids={w.memberIds} members={members} />
								<span className={s.givenDates}>
									filled {shortDay(w.earnedDay)} · {w.stars} ⭐
								</span>
								{Object.values(w.memberStars).some((n) => n > 0) && (
									<button className={s.takeBack} onClick={() => setTakingBack(w)}>
										Take back
									</button>
								)}
								<button className={s.redeem} disabled={redeem.isPending} onClick={() => redeem.mutate(w.id)}>
									Redeem
								</button>
							</li>
						))}
					</ul>
				)}

				<h2 className={s.section}>Redeemed</h2>
				{done.length === 0 ? (
					<p className={s.none}>Rewards show up here once they're redeemed.</p>
				) : (
					<>
						{byMonth.map((g) => (
							<div key={g.month} className={s.month}>
								<h3 className={s.monthName}>{g.month}</h3>
								<ul className={s.givenList}>
									{g.wins.map((w) => (
										<li key={w.id} className={w.missedOn ? s.missedRow : ""}>
											<span className={s.givenTitle}>
												{w.missedOn ? "⏰" : "🎁"} {w.title}
											</span>
											<Who ids={w.memberIds} members={members} />
											{w.givenAt ? (
												<>
													<span className={s.givenDates}>
														<b className={s.redeemedAt}>Redeemed {dayAndTime(w.givenAt)}</b> · filled{" "}
														{shortDay(w.earnedDay)}
													</span>
													<button
														className={s.undo}
														onClick={() => undoRedeem.mutate(w.id)}
														title="Not redeemed after all"
													>
														Undo
													</button>
												</>
											) : (
												<span className={s.givenDates}>
													missed its deadline, {shortDay(w.missedOn!)}
												</span>
											)}
										</li>
									))}
								</ul>
							</div>
						))}
						{done.length > 12 && (
							<button className={s.more} onClick={() => setShowAll(!showAll)}>
								{showAll ? "Show fewer" : `Show all ${done.length}`}
							</button>
						)}
					</>
				)}
			</div>

			{parent && <Fab label="Add a reward jar" onClick={() => setSheet({})} />}

			{takingBack && (
				<TakeBackDialog
					jar={{ id: takingBack.rewardId, title: takingBack.title }}
					kids={members
						.filter((m) => (takingBack.memberStars[m.id] ?? 0) > 0)
						.map((kid) => ({ kid, max: takingBack.memberStars[kid.id] }))}
					onClose={() => setTakingBack(null)}
				/>
			)}
			{sheet && (
				<RewardDialog
					key={sheet.reward?.id ?? "new"}
					reward={sheet.reward}
					today={today}
					onClose={() => setSheet(null)}
				/>
			)}
		</section>
	);
}
