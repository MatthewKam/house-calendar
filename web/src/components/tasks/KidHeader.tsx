import { percent, type Progress } from '../../lib/tasks';
import { momentKind } from '../../lib/moments';
import type { Member, Moment } from '../../lib/types';
import { StarIcon } from '../ui/icons';
import { Button } from '../ui/Button';
import s from './styles/Tasks.module.css';
import m from './styles/Moments.module.css';

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
	/** Parents: a sticker tapped, to ask whether to take it back. */
	onMoment?: (moment: Moment) => void;
	/** Tapping anywhere on it (but History or a sticker) folds away what's under it, or opens it again. */
	folded?: boolean;
	onFold?: (folded: boolean) => void;
}

/** The top of a kid's card: name and today's progress, and the stars in their bucket. */
export default function KidHeader({
	kid,
	progress: p,
	stars,
	showHistory,
	onHistory,
	moments,
	onMoment,
	folded,
	onFold,
}: Props) {
	const pct = percent(p);
	return (
		<header className={`${s.kidHead} ${onFold ? s.foldable : ''}`} onClick={() => onFold?.(!folded)}>
			<div className={s.head}>
				{/* Fills with their color as far as they've got through today's required tasks. Its tap
				    (and the keyboard's) reaches the header, which folds the card. */}
				{onFold ? (
					<button
						type="button"
						className={`${s.namePill} ${pct === 100 ? s.nameDone : ''}`}
						aria-expanded={!folded}
						aria-label={`${kid.name}: ${folded ? 'open' : 'fold away'}`}
					>
						{kid.name}
						{pct === 100 && ' ✓'}
					</button>
				) : (
					<span className={`${s.namePill} ${pct === 100 ? s.nameDone : ''}`}>
						{kid.name}
						{pct === 100 && ' ✓'}
					</span>
				)}
				<span className={`${s.progress} ${pct === 100 ? s.allDone : ''}`}>
					{!p ? 'Nothing required today' : pct === 100 ? 'All done! 🎉' : `${p.done} of ${p.due} today`}
				</span>
				<Button
					variant="link"
					size="sm"
					className={s.historyLink}
					aria-expanded={showHistory}
					onClick={(e) => {
						e.stopPropagation();
						onHistory();
					}}
				>
					{showHistory ? '← Today' : 'History'}
				</Button>
			</div>
			<div className={s.starsLine}>
				<StarIcon className={s.star} />
				<span>
					<b>{stars}</b> {stars === 1 ? 'star' : 'stars'} to spend
				</span>
			</div>
			{moments.length > 0 && (
				<div className={m.row} aria-label="Caught being good today">
					{moments.map((mo) => {
						const k = momentKind(mo.kind);
						const label = `${k.label}${mo.note ? `: ${mo.note}` : ''}`;
						return onMoment ? (
							<button
								key={mo.id}
								type="button"
								className={m.sticker}
								title={label}
								aria-label={`${label}. Tap to remove`}
								onClick={(e) => {
									e.stopPropagation();
									onMoment(mo);
								}}
							>
								{k.emoji}
							</button>
						) : (
							<span key={mo.id} className={m.sticker} title={label} role="img" aria-label={label}>
								{k.emoji}
							</span>
						);
					})}
				</div>
			)}
		</header>
	);
}
