import { useState, type FormEvent } from 'react';
import { useMembers, useRewardActions } from '../../lib/queries';
import type { Member, Reward, TeamMode } from '../../lib/types';
import ConfirmDialog from '../ui/ConfirmDialog';
import TakeBackDialog from './TakeBackDialog';
import { PickChip } from '../ui/NameChip';
import sheet from '../ui/Sheet.module.css';
import r from './Rewards.module.css';
import DateInput from '../ui/DateInput';
import Sheet from '../ui/Sheet';
import { Button, IconButton } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Field, Fieldset, Input } from '../ui/Field';

interface Props {
	/** Who a new jar starts out for (e.g. the kid whose section it was added from). */
	member?: Member;
	/** The jar to change; a new one when missing. */
	reward?: Reward;
	today: string;
	onClose: () => void;
}

const TEAM: { id: TeamMode; label: string; hint: string }[] = [
	{ id: 'pooled', label: 'Stars added together', hint: "Everyone's stars fill one jar." },
	{ id: 'each', label: 'Each fills it', hint: 'Every kid puts in the full amount; earned when they all have.' },
];

/** Add or change a reward jar: for one kid, or several together. */
export default function RewardDialog({ member, reward, today, onClose }: Props) {
	const members = useMembers().data ?? [];
	const { save, remove } = useRewardActions();
	const [title, setTitle] = useState(reward?.title ?? '');
	const [goal, setGoal] = useState(reward?.goal ?? 20);
	const [memberIds, setMemberIds] = useState<string[]>(reward?.memberIds ?? (member ? [member.id] : []));
	const [teamMode, setTeamMode] = useState<TeamMode>(reward?.teamMode ?? 'pooled');
	// Last day to redeem it, or none (it then fills again after each time it's redeemed).
	const [deadline, setDeadline] = useState<string | null>(reward?.deadline ?? null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	// Parents only: whose stars are being taken back out of this jar.
	const [takingBack, setTakingBack] = useState<Member | null>(null);
	const inJar = reward ? members.filter((m) => (reward.memberStars[m.id] ?? 0) > 0) : [];
	const together = memberIds.length > 1;
	const names = members.filter((m) => memberIds.includes(m.id)).map((m) => m.name);
	const problem = !title.trim()
		? 'Name the reward'
		: goal < 1
			? 'Pick how many stars'
			: !memberIds.length
				? "Pick who it's for"
				: deadline !== null && deadline < today && deadline !== reward?.deadline
					? 'Pick a deadline from today on'
					: null;

	function toggle(id: string) {
		// Family order, so names read the same everywhere.
		setMemberIds(
			memberIds.includes(id)
				? memberIds.filter((x) => x !== id)
				: members.map((m) => m.id).filter((x) => x === id || memberIds.includes(x)),
		);
	}

	function submit(e: FormEvent) {
		e.preventDefault();
		if (problem) return;
		save.mutate({ id: reward?.id, reward: { memberIds, title: title.trim(), goal, teamMode, deadline }, today });
		// It shows straight away; the save carries on in the background.
		onClose();
	}

	return (
		<>
			<Sheet label={reward ? 'Change jar' : 'New reward jar'} onClose={onClose} onSubmit={submit}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>{reward ? 'Change jar' : 'New reward jar'}</h2>
					<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
				</header>
				<Field label="What they earn">
					<Input
						placeholder="e.g. Movie night"
						value={title}
						maxLength={80}
						autoFocus={!reward}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</Field>

				<Fieldset label="Who" labelHint="pick more than one to earn it together">
					{members.map((m) => {
						const on = memberIds.includes(m.id);
						return <PickChip key={m.id} name={m.name} color={m.color} on={on} onClick={() => toggle(m.id)} />;
					})}
				</Fieldset>
				{together && (
					<Fieldset
						label="Filled how"
						hint={
							teamMode === 'pooled'
								? `${names.join(' and ')}'s stars fill one jar.`
								: `${names.join(' and ')} each put in the full amount.`
						}
					>
						{TEAM.map((x) => (
							<Chip key={x.id} pressed={teamMode === x.id} onClick={() => setTeamMode(x.id)}>
								{x.label}
							</Chip>
						))}
					</Fieldset>
				)}

				<Field
					className={r.goal}
					label={
						together && teamMode === 'pooled'
							? 'Stars to fill it, together'
							: together
								? 'Stars each'
								: 'Stars to fill it'
					}
				>
					<Input
						type="number"
						min={1}
						max={100000}
						inputMode="numeric"
						value={goal}
						onChange={(e) => setGoal(Math.max(0, Math.round(Number(e.target.value) || 0)))}
					/>
				</Field>
				<Fieldset
					label="Deadline"
					hint={
						deadline === null
							? "After it's redeemed, it empties and can be filled again."
							: "One time only. If it isn't redeemed by then, the kids get their stars back to use on another jar."
					}
				>
					<Chip pressed={deadline === null} onClick={() => setDeadline(null)}>
						None
					</Chip>
					<Chip pressed={deadline !== null} onClick={() => setDeadline(deadline ?? today)}>
						By a date
					</Chip>
					{deadline !== null && (
						<DateInput
							className={r.date}
							value={deadline}
							min={today}
							aria-label="Last day to redeem it"
							onChange={(e) => e.target.value && setDeadline(e.target.value)}
						/>
					)}
				</Fieldset>
				{inJar.length > 0 && (
					<>
						<div className={r.inJarHead}>
							Stars in it <span className={r.labelHint}>· parents can take some back (master PIN)</span>
						</div>
						<ul className={r.inJar}>
							{inJar.map((m) => (
								<li key={m.id}>
									<span>
										<b>{m.name}</b> · {reward!.memberStars[m.id]} ⭐
									</span>
									<Button variant="quiet" size="sm" onClick={() => setTakingBack(m)}>
										Take back
									</Button>
								</li>
							))}
						</ul>
					</>
				)}
				{save.isError && <div className={r.problem}>Couldn't save: {save.error.message}</div>}
				<div className={sheet.actions}>
					{reward && (
						<Button variant="danger" onClick={() => setConfirmDelete(true)}>
							Delete
						</Button>
					)}
					<span className={sheet.spacer} />
					<Button onClick={onClose}>Cancel</Button>
					<Button variant="primary" type="submit" disabled={!!problem}>
						Save
					</Button>
				</div>
			</Sheet>
			{reward && takingBack && (
				<TakeBackDialog
					jar={reward}
					kids={[{ kid: takingBack, max: reward.memberStars[takingBack.id] ?? 0 }]}
					onClose={() => setTakingBack(null)}
				/>
			)}
			{reward && confirmDelete && (
				<ConfirmDialog
					title={`Delete "${reward.title}"?`}
					confirmLabel="Delete"
					onCancel={() => setConfirmDelete(false)}
					onConfirm={() => {
						remove.mutate(reward.id);
						onClose();
					}}
				>
					Stars in it go back to the kids' buckets. Rewards already redeemed stay in the history.
				</ConfirmDialog>
			)}
		</>
	);
}
