import { useState } from 'react';
import { useBuckets, useRewardActions, useRewardHistory, useRewards } from '../../lib/queries';
import type { Member, Reward, RewardWin } from '../../lib/types';
import RewardDialog from './RewardDialog';
import KidJars from './KidJars';
import TakeBackDialog from './TakeBackDialog';
import { Who, dayAndTime, shortDay, toDate } from './JarBits';
import Fab from '../nav/Fab';
import { useParent } from '../../lib/useParent';
import { Loading, Skeleton } from '../ui/Skeleton';
import Problem, { loadProblem } from '../ui/Problem';
import { Button } from '../ui/Button';
import { SectionHead } from '../ui/Card';
import { tapArea } from '../../lib/haptics';
import s from './Rewards.module.css';
import { useFolded } from '../../lib/useFolded';

interface Props {
	today: string;
	members: Member[];
}

/** Earned's or Redeemed's heading: a tap folds what's under it away (showing how many) or opens it. */
function FoldHead({
	title,
	count,
	folded,
	onFold,
}: {
	title: string;
	count: number;
	folded: boolean;
	onFold: () => void;
}) {
	return (
		<SectionHead>
			<button type="button" className={s.foldHead} aria-expanded={!folded} onClick={onFold}>
				{title}
				{folded && <span className={s.foldCount}>{count}</span>}
			</button>
		</SectionHead>
	);
}

const monthOf = (d: string) => toDate(d).toLocaleDateString([], { month: 'long', year: 'numeric' });

/** Rewards: each kid's stars and jars, full jars waiting to be redeemed, then everything redeemed (or missed) so far. */
export default function RewardsPage({ today, members }: Props) {
	const jarsQuery = useRewards(today);
	const jars = jarsQuery.data ?? [];
	const history = useRewardHistory().data ?? [];
	const buckets = useBuckets().data ?? [];
	const { redeem, undoRedeem } = useRewardActions();
	// Parents only: the full jar whose stars are being taken back.
	const [takingBack, setTakingBack] = useState<RewardWin | null>(null);
	const [sheet, setSheet] = useState<{ reward?: Reward } | null>(null);
	// Making and changing jars needs a parent (the lock in the left bar); using them doesn't.
	const { parent } = useParent();
	const [showAll, setShowAll] = useState(false);
	// What's folded away, kept on this device: each kid's card (by id), 'earned' and 'redeemed'.
	const folds = useFolded('sprig:reward-sections-folded');

	const starsOf = (id: string) => buckets.find((b) => b.memberId === id)?.stars ?? 0;
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
	const byMonth = shown.reduce<{ month: string; wins: RewardWin[] }[]>((groups, w) => {
		const month = monthOf(w.givenAt ?? w.missedOn!);
		const last = groups.at(-1);
		if (last?.month === month) last.wins.push(w);
		else groups.push({ month, wins: [w] });
		return groups;
	}, []);

	return (
		<section className={s.page} aria-label="Rewards" {...tapArea}>
			<header className={s.pageHead}>
				<div>
					<h1 className={s.pageTitle}>Rewards</h1>
				</div>
			</header>

			<div className={s.scroll}>
				{jarsQuery.isError ? (
					<Problem
						kind="page"
						message={loadProblem('reward jars', jarsQuery.error)}
						onRetry={() => void jarsQuery.refetch()}
					/>
				) : jarsQuery.isPending ? (
					<Loading label="Loading reward jars" className={s.kids}>
						<Skeleton height="12rem" />
						<Skeleton height="12rem" />
					</Loading>
				) : kids.length === 0 ? (
					<p className={s.none}>
						No reward jars yet. Tap + to make one; kids fill them with the stars they earn from extras.
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
								jars={jars.filter((j) => j.status !== 'earned' && j.memberIds.includes(kid.id))}
								onEdit={parent ? (reward) => setSheet({ reward }) : undefined}
								folded={folds.isFolded(kid.id)}
								onFold={(on) => folds.fold([kid.id], on)}
							/>
						))}
					</div>
				)}

				<FoldHead
					title="Earned 🎉"
					count={waiting.length}
					folded={folds.isFolded('earned')}
					onFold={() => folds.fold(['earned'], !folds.isFolded('earned'))}
				/>
				{folds.isFolded('earned') ? null : waiting.length === 0 ? (
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
									<Button variant="quiet" size="sm" onClick={() => setTakingBack(w)}>
										Take back
									</Button>
								)}
								<Button variant="primary" size="sm" disabled={redeem.isPending} onClick={() => redeem.mutate(w.id)}>
									Redeem
								</Button>
							</li>
						))}
					</ul>
				)}

				<FoldHead
					title="Redeemed"
					count={done.length}
					folded={folds.isFolded('redeemed')}
					onFold={() => folds.fold(['redeemed'], !folds.isFolded('redeemed'))}
				/>
				{folds.isFolded('redeemed') ? null : done.length === 0 ? (
					<p className={s.none}>Rewards show up here once they're redeemed.</p>
				) : (
					<>
						{byMonth.map((g) => (
							<div key={g.month} className={s.month}>
								<h3 className={s.monthName}>{g.month}</h3>
								<ul className={s.givenList}>
									{g.wins.map((w) => (
										<li key={w.id} className={w.missedOn ? s.missedRow : ''}>
											<span className={s.givenTitle}>
												{w.missedOn ? '⏰' : '🎁'} {w.title}
											</span>
											<Who ids={w.memberIds} members={members} />
											{w.givenAt ? (
												<>
													<span className={s.givenDates}>
														<b className={s.redeemedAt}>Redeemed {dayAndTime(w.givenAt)}</b> · filled{' '}
														{shortDay(w.earnedDay)}
													</span>
													<Button
														variant="quiet"
														size="sm"
														onClick={() => undoRedeem.mutate(w.id)}
														title="Not redeemed after all"
													>
														Undo
													</Button>
												</>
											) : (
												<span className={s.givenDates}>missed its deadline, {shortDay(w.missedOn!)}</span>
											)}
										</li>
									))}
								</ul>
							</div>
						))}
						{done.length > 12 && (
							<Button variant="link" size="sm" className={s.more} onClick={() => setShowAll(!showAll)}>
								{showAll ? 'Show fewer' : `Show all ${done.length}`}
							</Button>
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
					key={sheet.reward?.id ?? 'new'}
					reward={sheet.reward}
					today={today}
					onClose={() => setSheet(null)}
				/>
			)}
		</section>
	);
}
