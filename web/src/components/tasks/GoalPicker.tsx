import { useState } from 'react';
import { useGoalActions, useGoalLibrary } from '../../lib/queries';
import type { GoalTemplate, Stage } from '../../lib/types';
import s from './Goals.module.css';

interface Props {
	/** The kid's stage, to show goals for their age first; null shows every age. */
	stage: Stage | null;
	/** The goal picked, if it's one from the list. */
	picked: string | null;
	onPick: (goal: GoalTemplate) => void;
}

/**
 * The goal list in the Task/Goal dialog: starter goals for the kid's age and the family's own, as
 * big picture tiles. "Choose which show" turns every goal into a switch, to hide the ones the family
 * won't use (or all of them, then bring a few back).
 */
export default function GoalPicker({ stage, picked, onPick }: Props) {
	const library = useGoalLibrary().data ?? [];
	const { hide, hideAll } = useGoalActions();
	const [showAll, setShowAll] = useState(false);
	const [choosing, setChoosing] = useState(false);

	const forAge = showAll || !stage ? library : library.filter((g) => g.stages.length === 0 || g.stages.includes(stage));
	const shown = choosing ? library : forAge.filter((g) => !g.hidden);
	const hiddenCount = library.filter((g) => g.hidden).length;
	const busy = hide.isPending || hideAll.isPending;

	return (
		<div className={s.picker}>
			{choosing && (
				<>
					<p className={s.hint}>
						Tap a goal to hide it from the list, or tap it again to bring it back. Your own goals stay here until you
						hide them.
					</p>
					<div className={s.allButtons}>
						<button
							type="button"
							className={s.allButton}
							disabled={busy || hiddenCount === 0}
							onClick={() => hideAll.mutate(false)}
						>
							Show all
						</button>
						<button
							type="button"
							className={s.allButton}
							disabled={busy || hiddenCount === library.length}
							onClick={() => hideAll.mutate(true)}
						>
							Hide all
						</button>
					</div>
				</>
			)}
			{shown.length === 0 && !choosing && (
				<p className={s.hint}>Every goal is hidden. Type your own above, or choose which show.</p>
			)}
			<div className={s.library}>
				{shown.map((g) => (
					<button
						key={g.key}
						type="button"
						className={`${s.tile} ${choosing && g.hidden ? s.tileHidden : ''} ${!choosing && picked === g.key ? s.tilePicked : ''}`}
						disabled={busy}
						aria-pressed={choosing ? !g.hidden : picked === g.key}
						onClick={() => (choosing ? hide.mutate({ key: g.key, hidden: !g.hidden }) : onPick(g))}
					>
						<span className={s.tileEmoji} aria-hidden="true">
							{g.emoji}
						</span>
						<span>{g.title}</span>
						{choosing && <span className={s.tileState}>{g.hidden ? 'Hidden' : 'Showing'}</span>}
					</button>
				))}
			</div>
			<div className={s.libraryLinks}>
				{!choosing && stage && (
					<button type="button" className={s.textButton} onClick={() => setShowAll(!showAll)}>
						{showAll ? 'Just ones for their age' : 'Show goals for every age'}
					</button>
				)}
				<button type="button" className={s.textButton} onClick={() => setChoosing(!choosing)}>
					{choosing ? 'Done' : `Choose which show${hiddenCount ? ` (${hiddenCount} hidden)` : ''}`}
				</button>
			</div>
		</div>
	);
}
