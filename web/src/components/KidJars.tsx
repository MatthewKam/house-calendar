import { useRef, useState, type CSSProperties } from "react";
import { useRewardActions } from "../lib/queries";
import { flyStar } from "../lib/flyStar";
import type { Member, Reward } from "../lib/types";
import { PencilIcon, StarIcon } from "./icons";
import ConfirmDialog from "./ConfirmDialog";
import { JarProgress, eachFills, shortDay } from "./JarBits";
import s from "../styles/Rewards.module.css";

interface Props {
	kid: Member;
	members: Member[];
	today: string;
	/** Stars in their bucket. */
	bucket: number;
	/** Their jars still filling, and missed ones. */
	jars: Reward[];
	/** Changing a jar, and a missed one's Add back and Remove (missing while the parent lock is on). */
	onEdit?: (jar: Reward) => void;
}

/**
 * Stars being placed, before they're confirmed: how many by each jar. `from` is a missed jar the
 * stars come out of (otherwise they come from the bucket).
 */
type Stage = { from?: Reward; counts: Record<string, number> };

/** "a", "a and b", "a, b and c". */
const listOf = (parts: string[]) =>
	parts.length < 2
		? parts.join("")
		: `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
/** Under a jar's name: its deadline, and how a shared jar fills. */
const subtitle = (j: Reward) =>
	[
		j.deadline ? `Redeem by ${shortDay(j.deadline)}` : "No deadline",
		j.memberIds.length > 1 && (eachFills(j) ? "each fills it" : "filled together"),
	]
		.filter(Boolean)
		.join(" · ");
const stars = (n: number) => `${n} ${n === 1 ? "star" : "stars"}`;

/**
 * One kid on the Rewards page: their bucket, missed jars to sort out, the jars they're filling, and
 * full ones waiting to be redeemed. "Use stars" places stars by the jars (tap a jar, − to take one
 * back), then asks before they go in for good.
 */
export default function KidJars({
	kid,
	members,
	today,
	bucket,
	jars,
	onEdit,
}: Props) {
	const { place, restore, remove } = useRewardActions();
	const [stage, setStage] = useState<Stage | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [restoring, setRestoring] = useState<{
		jar: Reward;
		deadline: string;
	} | null>(null);
	const [removing, setRemoving] = useState<Reward | null>(null);
	// Parents only: the jar a kid's stars are being taken back out of, and how many of theirs are in it.


	const filling = jars.filter((j) => j.status === "filling");
	const missed = jars.filter((j) => j.status === "missed");
	const mine = (j: Reward) => j.memberStars[kid.id] ?? 0;
	const count = (j: Reward) => stage?.counts[j.id] ?? 0;
	const placed = filling.filter((j) => count(j) > 0);
	const staged = placed.reduce((a, j) => a + count(j), 0);
	const budget = stage?.from ? mine(stage.from) : bucket;
	const left = budget - staged;
	/** Room left in a jar, after what's placed by it. */
	const room = (j: Reward) =>
		j.goal - (eachFills(j) ? mine(j) : j.stars) - count(j);
	const canAdd = (j: Reward) => !!stage && left > 0 && room(j) > 0;
	const bump = (j: Reward, n: number) =>
		setStage(
			(st) =>
				st && {
					...st,
					counts: {
						...st.counts,
						[j.id]: Math.max(0, (st.counts[j.id] ?? 0) + n),
					},
				},
		);

	// A star placed by a jar flies there from the bucket's star; the jar's bar shows it once it lands.
	const sectionRef = useRef<HTMLElement>(null);
	const [flying, setFlying] = useState<Record<string, number>>({});
	const fly = (id: string, n: number) => setFlying((f) => ({ ...f, [id]: Math.max(0, (f[id] ?? 0) + n) }));
	const landed = (j: Reward) => Math.max(0, count(j) - (flying[j.id] ?? 0));
	function addStar(j: Reward) {
		if (!canAdd(j)) return;
		const section = sectionRef.current;
		const bars = section?.querySelectorAll(`[data-jar="${j.id}"] .${s.bar}`);
		// Each fills it: this kid's own bar; otherwise the jar's one bar.
		const bar = bars?.[eachFills(j) ? Math.max(0, j.memberIds.indexOf(kid.id)) : 0] ?? null;
		const have = (eachFills(j) ? mine(j) : j.stars) + count(j) + 1;
		if (flyStar(section?.querySelector(`.${s.bucket} svg`) ?? null, bar, have / j.goal, () => fly(j.id, -1))) fly(j.id, 1);
		bump(j, 1);
	}

	function confirm() {
		if (!stage) return;
		place.mutate({
			memberId: kid.id,
			today,
			from: stage.from?.id,
			places: placed.map((j) => ({ rewardId: j.id, stars: count(j) })),
		});
		setStage(null);
		setConfirming(false);
	}

	return (
		<section
			ref={sectionRef}
			className={s.kid}
			style={{ "--c": kid.color } as CSSProperties}
			aria-label={kid.name}
		>
			<header className={s.kidHead}>
				<span className={s.kidName}>{kid.name}</span>
				<span className={s.bucket}>
					<StarIcon className={s.star} />
					<b>{stage && !stage.from ? left : bucket}</b>{" "}
					{stage && !stage.from ? "left" : bucket === 1 ? "star" : "stars"}
				</span>
				{stage ? (
					<>
						<button className={s.cancel} onClick={() => setStage(null)}>
							Cancel
						</button>
						<button
							className={s.use}
							disabled={!staged}
							onClick={() => setConfirming(true)}
						>
							Done
						</button>
					</>
				) : (
					filling.length > 0 &&
					bucket > 0 && (
						<button className={s.use} onClick={() => setStage({ counts: {} })}>
							Use stars
						</button>
					)
				)}
			</header>
			{stage && (
				<p className={s.stageHint}>
					{stage.from
						? `Moving ${stars(budget)} from ${stage.from.title}. Tap a jar to put one in; any left go back to your bucket.`
						: "Tap a jar to put a star by it. Tap − if you put one in the wrong place."}
				</p>
			)}

			{/* Jars past their deadline: the kid moves their stars out, then a parent adds it back or removes it. */}
			{missed.map((j) => {
				const n = mine(j);
				const others = members
					.filter((m) => m.id !== kid.id && (j.memberStars[m.id] ?? 0) > 0)
					.map((m) => m.name);
				return (
					<div key={j.id} className={s.missed}>
						<span className={s.missedText}>
							⏰ <b>{j.title}</b> missed its deadline ({shortDay(j.deadline!)}).{" "}
							{n > 0
								? `${stars(n)} of yours are in it.`
								: others.length
									? `Waiting for ${listOf(others)} to move their stars.`
									: "It's empty: waiting for a parent."}
						</span>
						{n > 0 && !stage && (
							<span className={s.missedActions}>
								<button
									className={s.quiet}
									onClick={() =>
										place.mutate({
											memberId: kid.id,
											today,
											from: j.id,
											places: [],
										})
									}
								>
									Back to my bucket
								</button>
								{filling.length > 0 && (
									<button
										className={s.use}
										onClick={() => setStage({ from: j, counts: {} })}
									>
										Move to another jar
									</button>
								)}
							</span>
						)}
						{j.stars === 0 && onEdit && (
							<span className={s.missedActions}>
								<button className={s.quiet} onClick={() => setRemoving(j)}>
									Remove
								</button>
								<button
									className={s.use}
									onClick={() => setRestoring({ jar: j, deadline: "" })}
								>
									Add back
								</button>
							</span>
						)}
					</div>
				);
			})}

			<h3 className={s.sub}>Jars</h3>
			{filling.length === 0 ? (
				<p className={s.none}>No jars to fill yet.</p>
			) : (
				<ul className={s.list}>
					{filling.map((j) => (
						<li
							key={j.id}
							data-jar={j.id}
							className={`${s.row} ${stage ? s.picking : ""} ${count(j) ? s.picked : ""}`}
							// While placing stars, tapping a jar puts one more by it.
							onClick={() => addStar(j)}
						>
							<div className={s.rowMain}>
								<span className={s.rowTitle}>
									{j.title}
									{!stage && onEdit && (
										<button className={s.edit} onClick={() => onEdit?.(j)} aria-label={`Change ${j.title}`}>
											<PencilIcon />
										</button>
									)}
								</span>
								<span className={s.rowSub}>{subtitle(j)}</span>
								<JarProgress r={j} members={members} adding={stage ? { kid, n: landed(j) } : undefined} />
							</div>
							{stage ? (
								<div className={s.stager}>
									<button
										className={s.step}
										disabled={!count(j)}
										aria-label={`Take a star back from ${j.title}`}
										onClick={(e) => {
											e.stopPropagation();
											bump(j, -1);
										}}
									>
										−
									</button>
									<span className={s.staged}>{count(j) ? `+${count(j)}` : room(j) > 0 ? "" : "Full"}</span>
									<button
										className={s.step}
										disabled={!canAdd(j)}
										aria-label={`Put a star in ${j.title}`}
										onClick={(e) => {
											e.stopPropagation();
											addStar(j);
										}}
									>
										+
									</button>
								</div>
							) : null}
						</li>
					))}
				</ul>
			)}

			{confirming && stage && (
				<ConfirmDialog
					safe
					title={`Put ${listOf(placed.map((j) => `${count(j)} in ${j.title}`))}?`}
					confirmLabel="Put them in"
					onCancel={() => setConfirming(false)}
					onConfirm={confirm}
				>
					{stage.from &&
						left > 0 &&
						`The other ${stars(left)} go back to your bucket. `}
					Stars can't come back out once they're in a jar.
				</ConfirmDialog>
			)}
			{restoring && (
				<ConfirmDialog
					safe
					title={`Add ${restoring.jar.title} back?`}
					confirmLabel="Add back"
					onCancel={() => setRestoring(null)}
					onConfirm={() => {
						restore.mutate({
							id: restoring.jar.id,
							deadline: restoring.deadline || null,
							today,
						});
						setRestoring(null);
					}}
				>
					<label className={s.restoreDate}>
						New deadline (leave empty for none)
						<input
							type="date"
							className={s.date}
							value={restoring.deadline}
							min={today}
							onChange={(e) =>
								setRestoring({ ...restoring, deadline: e.target.value })
							}
						/>
					</label>
				</ConfirmDialog>
			)}
			{removing && (
				<ConfirmDialog
					title={`Remove ${removing.title}?`}
					confirmLabel="Remove"
					onCancel={() => setRemoving(null)}
					onConfirm={() => {
						remove.mutate(removing.id);
						setRemoving(null);
					}}
				>
					It stays in the history as missed.
				</ConfirmDialog>
			)}
		</section>
	);
}
