import { useState, type CSSProperties } from "react";
import { useRewardActions, useRewardHistory, useRewards } from "../lib/queries";
import { fromDayKey } from "../lib/dates";
import { textOn } from "../lib/color";
import type { Member, Reward, RewardWin } from "../lib/types";
import { GiftIcon, PencilIcon, StarIcon } from "./icons";
import RewardDialog from "./RewardDialog";
import Fab from "./Fab";
import s from "../styles/Rewards.module.css";

interface Props {
	today: string;
	members: Member[];
}

/** Filter: everything, one kid's, or only rewards shared by several kids. */
type Filter = null | string | "together";
const TOGETHER = "together";

const day = (d: string) =>
	fromDayKey(d.slice(0, 10)).toLocaleDateString([], {
		month: "short",
		day: "numeric",
	});
const monthOf = (iso: string) =>
	fromDayKey(iso.slice(0, 10)).toLocaleDateString([], {
		month: "long",
		year: "numeric",
	});

/** Days left in today's month, counting today. */
function daysLeft(today: string) {
	const d = fromDayKey(today);
	return (
		new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1
	);
}

/** The kids' names, each in their color; "together" when there's more than one. */
function Who({ ids, members }: { ids: string[]; members: Member[] }) {
	const who = members.filter((m) => ids.includes(m.id));
	return (
		<span className={s.who}>
			{who.map((m) => (
				<span
					key={m.id}
					className={s.name}
					style={
						{ background: m.color, color: textOn(m.color) } as CSSProperties
					}
				>
					{m.name}
				</span>
			))}
			{who.length > 1 && <span className={s.together}>together</span>}
		</span>
	);
}

/** Stars toward the goal: one bar split by who added what, or (each-reaches) one bar per kid. */
function Progress({ r, members }: { r: Reward; members: Member[] }) {
	const who = members.filter((m) => r.memberIds.includes(m.id));
	if (r.teamMode === "each" && who.length > 1) {
		return (
			<div className={s.eachBars}>
				{who.map((m) => {
					const n = r.memberStars[m.id] ?? 0;
					return (
						<div key={m.id} className={s.eachRow}>
							<span className={s.eachName}>{m.name}</span>
							<span className={s.bar}>
								<span
									style={{
										width: `${Math.min(100, (n / r.goal) * 100)}%`,
										background: m.color,
									}}
								/>
							</span>
							<span className={s.count}>
								{Math.min(n, r.goal)}/{r.goal}
							</span>
						</div>
					);
				})}
			</div>
		);
	}
	return (
		<div className={s.eachRow}>
			<span className={s.bar}>
				{who.map((m) => (
					<span
						key={m.id}
						title={`${m.name}: ${r.memberStars[m.id] ?? 0} ⭐`}
						style={{
							width: `${Math.min(100, ((r.memberStars[m.id] ?? 0) / r.goal) * 100)}%`,
							background: m.color,
						}}
					/>
				))}
			</span>
			<span className={s.count}>
				<StarIcon className={s.star} />
				{Math.min(r.stars, r.goal)}/{r.goal}
			</span>
		</div>
	);
}

/** Rewards: ready to hand over, in progress, and everything given so far, by kid. */
export default function RewardsPage({ today, members }: Props) {
	const rewards = useRewards(today).data ?? [];
	const history = useRewardHistory().data ?? [];
	const { giveWin, undoWin } = useRewardActions();
	const [filter, setFilter] = useState<Filter>(null);
	const [sheet, setSheet] = useState<{ reward?: Reward } | null>(null);
	const [showAllGiven, setShowAllGiven] = useState(false);

	const matches = (ids: string[]) =>
		!filter || (filter === TOGETHER ? ids.length > 1 : ids.includes(filter));
	// Sorted by who it's for (each kid in family order, then rewards shared by several), then by name.
	const rank = (ids: string[]) =>
		ids.length > 1 ? members.length : Math.max(0, members.findIndex((m) => m.id === ids[0]));
	const byWho = <T extends { memberIds: string[]; title: string }>(a: T, b: T) =>
		rank(a.memberIds) - rank(b.memberIds) ||
		a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
	const ready = history
		.filter((w) => !w.givenAt && matches(w.memberIds))
		.sort(byWho);
	const going = rewards
		.filter((r) => r.status !== "earned" && matches(r.memberIds))
		.sort(byWho);
	const given = history.filter((w) => w.givenAt && matches(w.memberIds));
	// Only kids who have, or have had, a reward.
	const kids = members.filter(
		(m) =>
			rewards.some((r) => r.memberIds.includes(m.id)) ||
			history.some((w) => w.memberIds.includes(m.id)),
	);
	const year = today.slice(0, 4);
	const shownGiven = showAllGiven ? given : given.slice(0, 12);
	const byMonth = shownGiven.reduce<{ month: string; wins: RewardWin[] }[]>(
		(groups, w) => {
			const month = monthOf(w.givenAt!);
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
				<h1 className={s.pageTitle}>Rewards</h1>
				<div className={s.filters}>
					{[
						...kids.map((m) => ({ id: m.id, label: m.name, color: m.color })),
						...(rewards.some((r) => r.memberIds.length > 1) ||
						history.some((w) => w.memberIds.length > 1)
							? [{ id: TOGETHER, label: "Together", color: "#8b8f98" }]
							: []),
					].map((f) => (
						<button
							key={f.id}
							className={`${s.filter} ${filter === f.id ? s.filterOn : ""}`}
							aria-pressed={filter === f.id}
							style={{ "--c": f.color } as CSSProperties}
							onClick={() => setFilter(filter === f.id ? null : f.id)}
						>
							<i style={{ background: f.color }} />
							{f.label}
						</button>
					))}
					
				</div>
			</header>

			{/* Each kid's tally this year. */}
			{kids.length > 0 && (
				<div className={s.tally}>
					{kids.map((m) => {
						const mine = history.filter(
							(w) => w.givenAt?.startsWith(year) && w.memberIds.includes(m.id),
						);
						return (
							<div
								key={m.id}
								className={s.tallyItem}
								style={{ "--c": m.color } as CSSProperties}
							>
								<span className={s.tallyName}>{m.name}</span>
								<span className={s.tallyNumber}>{mine.length}</span>
								<span className={s.tallyLabel}>
									{mine.length === 1 ? "reward" : "rewards"} in {year}
								</span>
							</div>
						);
					})}
				</div>
			)}

			<div className={s.scroll}>
				{ready.length > 0 && (
					<>
						<h2 className={s.section}>Ready to hand over 🎉</h2>
						<div className={s.grid}>
							{ready.map((w) => (
								<article key={w.id} className={`${s.card} ${s.earned}`}>
									<div className={s.cardTop}>
										<GiftIcon />
										<h3 className={s.title}>{w.title}</h3>
									</div>
									<Who ids={w.memberIds} members={members} />
									<div className={s.meta}>
										Earned {day(w.earnedDay)} · {w.stars} ⭐
									</div>
									<button
										className={s.give}
										disabled={giveWin.isPending}
										onClick={() => giveWin.mutate({ id: w.id, today })}
									>
										Mark as given
									</button>
								</article>
							))}
						</div>
					</>
				)}

				<h2 className={s.section}>In progress</h2>
				{going.length === 0 ? (
					<p className={s.none}>
						{rewards.length
							? "Nothing in progress for this filter."
							: "No rewards yet. Tap + New reward to set one."}
					</p>
				) : (
					<div className={s.grid}>
						{going.map((r) => (
							<article
								key={r.id}
								className={`${s.card} ${r.status === "given" ? s.doneForNow : ""}`}
							>
								<div className={s.cardTop}>
									<GiftIcon />
									<h3 className={s.title}>{r.title}</h3>
									<button
										className={s.edit}
										onClick={() => setSheet({ reward: r })}
										aria-label={`Change ${r.title}`}
									>
										<PencilIcon />
									</button>
								</div>
								<Who ids={r.memberIds} members={members} />
								{r.status === "given" ? (
									<div className={s.meta}>
										Given for this month ✓ · starts again on the 1st
									</div>
								) : (
									<>
										<Progress r={r} members={members} />
										<div className={s.meta}>
											{r.mode === "monthly"
												? `This month · ${daysLeft(today)} ${daysLeft(today) === 1 ? "day" : "days"} left`
												: `Until earned${r.repeats ? " · starts again when given" : ""}`}
											{r.memberIds.length > 1 &&
												(r.teamMode === "each"
													? " · each reaches the goal"
													: " · stars added together")}
										</div>
									</>
								)}
							</article>
						))}
					</div>
				)}

				<h2 className={s.section}>Given</h2>
				{given.length === 0 ? (
					<p className={s.none}>
						Rewards show up here once they're handed over.
					</p>
				) : (
					<>
						{byMonth.map((g) => (
							<div key={g.month} className={s.month}>
								<h3 className={s.monthName}>{g.month}</h3>
								<ul className={s.givenList}>
									{g.wins.map((w) => (
										<li key={w.id}>
											<span className={s.givenTitle}>🎁 {w.title}</span>
											<Who ids={w.memberIds} members={members} />
											<span className={s.givenDates}>
												earned {day(w.earnedDay)} · given {day(w.givenAt!)}
											</span>
											<button
												className={s.undo}
												onClick={() => undoWin.mutate(w.id)}
												title="Not given after all"
											>
												Undo
											</button>
										</li>
									))}
								</ul>
							</div>
						))}
						{given.length > 12 && (
							<button
								className={s.more}
								onClick={() => setShowAllGiven(!showAllGiven)}
							>
								{showAllGiven ? "Show fewer" : `Show all ${given.length}`}
							</button>
						)}
					</>
				)}
			</div>

			{/* Add a reward, for no one in particular yet (Who is picked in the form). */}
			<Fab label="Add a reward" onClick={() => setSheet({})} />

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
