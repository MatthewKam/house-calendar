import { useState } from 'react';
import { addDays, dayKey } from '../../lib/dates';
import { boxValue, whenText } from '../../lib/meals';
import { useRemindPrep } from '../../lib/queries';
import { aheadText } from '../../lib/recipes';
import type { Recipe } from '../../lib/types';
import { useNow } from '../../lib/useNow';
import { problemText } from '../../lib/api';
import Problem from '../ui/Problem';
import Sheet from '../ui/Sheet';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';
import { Button, IconButton } from '../ui/Button';
import { Chip } from '../ui/Chip';

/** `hour` o'clock on the day `days` from now. */
const at = (now: Date, days: number, hour: number) => {
	const d = addDays(now, days);
	d.setHours(hour, 0, 0, 0);
	return d.getTime();
};

/**
 * Just remind me: a reminder on To do for a recipe's prep (thaw the ribeye, marinate the beef), at a time
 * picked (tonight, tomorrow, or any time), without putting the recipe on a day.
 */
export default function RemindMe({ recipe: r, onClose }: { recipe: Recipe; onClose: () => void }) {
	const now = useNow();
	const today = dayKey(now);
	const remind = useRemindPrep();
	const steps = r.prepAhead.filter((p) => p.hoursBefore > 0);
	const [chosen, setChosen] = useState(steps.map((p) => p.what));
	const times = [
		...(now.getHours() < 20 ? [{ label: 'Tonight 8 PM', at: at(now, 0, 20) }] : []),
		{ label: 'Tomorrow 8 AM', at: at(now, 1, 8) },
		{ label: 'Tomorrow 8 PM', at: at(now, 1, 20) },
	];
	const [when, setWhen] = useState(times[0].at);
	const picked = !times.some((t) => t.at === when);
	// Added (what it says), or a problem adding it.
	const [said, setSaid] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);

	const save = () => {
		const items = steps
			.filter((p) => chosen.includes(p.what))
			.map((p) => ({ title: `${p.what.replace(/[.\s]+$/, '')} (${r.title})`, due: new Date(when).toISOString() }));
		if (!items.length) return;
		setProblem(null);
		remind.mutate(items, {
			onSuccess: () => setSaid(`On To do for ${whenText(when, today)}.`),
			onError: (err) => setProblem(problemText(err, "Couldn't add it just now.")),
		});
	};

	return (
		<Sheet
			label="Just remind me"
			onClose={onClose}
			className={s.planView}
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<header className={sheet.head}>
				<h2 className={sheet.heading}>Remind me</h2>
				<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
			</header>
			<div className={s.part}>
				<h3 className={s.planLabel}>To do</h3>
				<ul className={s.remindSteps}>
					{steps.map((p) => (
						<li key={p.what}>
							<label className={s.remindStep}>
								<input
									type="checkbox"
									checked={chosen.includes(p.what)}
									onChange={(e) =>
										setChosen(e.target.checked ? [...chosen, p.what] : chosen.filter((x) => x !== p.what))
									}
								/>
								<span>
									{p.what} <span className={s.hint}>({aheadText(p.hoursBefore)})</span>
								</span>
							</label>
						</li>
					))}
				</ul>
			</div>
			<div className={s.part}>
				<h3 className={s.planLabel}>When</h3>
				<div className={s.tagChoices}>
					{times.map((t) => (
						<Chip
							key={t.label}

							pressed={when === t.at}
							onClick={() => setWhen(t.at)}
						>
							{t.label}
						</Chip>
					))}
					<label className={`${s.chip} ${s.planDate}`} data-on={picked || undefined}>
						🕰️ {picked ? whenText(when, today) : 'Pick a time'}
						<input
							type="datetime-local"
							aria-label="Pick a time"
							value={boxValue(when)}
							onChange={(e) => e.target.value && setWhen(new Date(e.target.value).getTime())}
						/>
					</label>
				</div>
			</div>
			{problem && <Problem message={problem} onRetry={save} />}
			{said && (
				<p className={s.said} role="status">
					{said}
				</p>
			)}
			<div className={`${sheet.actions} ${s.planActions}`}>
				<span className={sheet.spacer} />
				<Button onClick={onClose}>{said ? 'Done' : 'Cancel'}</Button>
				{!said && (
					<Button variant="primary" type="submit" disabled={!chosen.length || remind.isPending}>
						{remind.isPending ? 'Adding…' : 'Remind me'}
					</Button>
				)}
			</div>
		</Sheet>
	);
}
