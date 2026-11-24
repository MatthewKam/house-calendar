import { useMemo, useState } from 'react';
import { addDays, dayKey, fromDayKey } from '../../lib/dates';
import { useMomentActions, useMomentHistory } from '../../lib/queries';
import { MOMENT_KINDS, momentKind } from '../../lib/moments';
import type { Member, MomentKind } from '../../lib/types';
import { PickChip } from '../ui/NameChip';
import PointsStepper from './PointsStepper';
import ConfirmBelow from '../ui/ConfirmBelow';
import sheet from '../ui/styles/Sheet.module.css';
import s from './styles/Moments.module.css';
import g from './styles/Goals.module.css';
import Sheet from '../ui/Sheet';
import { Button, IconButton } from '../ui/Button';
import { Field, Fieldset, Input } from '../ui/Field';
import { Segmented } from '../ui/Segmented';

/** How far back the history goes. */
const HISTORY_DAYS = 30;

interface Props {
	/** The kids to pick from. */
	kids: Member[];
	today: string;
	onClose: () => void;
}

/**
 * Parents only: caught a kid being good. Pick the kid, the activity and the stars (a note too, if
 * you like), and the cheer follows on every screen. History lists what's been caught lately, to take
 * one back that was added by mistake.
 */
export default function MomentDialog({ kids, today, onClose }: Props) {
	const { add, remove } = useMomentActions();
	const [tab, setTab] = useState<'catch' | 'history'>('catch');
	const [kidId, setKidId] = useState<string | null>(kids.length === 1 ? kids[0].id : null);
	const [kind, setKind] = useState<MomentKind | null>(null);
	const [stars, setStars] = useState(1);
	const [note, setNote] = useState('');
	const from = useMemo(() => dayKey(addDays(fromDayKey(today), -HISTORY_DAYS)), [today]);
	const history = useMomentHistory(from, today).data ?? [];
	// The moment asking "Remove?" below itself.
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const ready = kidId && kind;
	const day = (d: string) =>
		d === today ? 'Today' : fromDayKey(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

	return (
		<>
			<Sheet label="Caught being good" onClose={onClose}>
				<div className={sheet.head}>
					<h2 className={sheet.heading}>✨ Caught being good</h2>
					<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
				</div>
				<Segmented
					tabs
					label="Catch one or see the history"
					value={tab}
					onChange={setTab}
					options={[
						{ id: 'catch', label: 'Catch one' },
						{ id: 'history', label: 'History' },
					]}
				/>

				{tab === 'catch' ? (
					<form
						className={s.form}
						onSubmit={(e) => {
							e.preventDefault();
							if (!kidId || !kind) return;
							add.mutate(
								{ memberId: kidId, kind, stars, note: note.trim() || undefined, day: today },
								{ onSuccess: onClose },
							);
						}}
					>
						<Fieldset label="Who">
							{kids.map((k) => (
								<PickChip key={k.id} name={k.name} color={k.color} on={kidId === k.id} onClick={() => setKidId(k.id)} />
							))}
						</Fieldset>
						<Fieldset label="What for">
							<div className={s.kinds}>
								{MOMENT_KINDS.map((k) => (
									<button
										key={k.kind}
										type="button"
										className={s.kind}
										aria-pressed={kind === k.kind}
										onClick={() => setKind(k.kind)}
									>
										<span className={s.kindEmoji} aria-hidden="true">
											{k.emoji}
										</span>
										<span>{k.label}</span>
									</button>
								))}
							</div>
						</Fieldset>
						<Fieldset label="Worth">
							<PointsStepper value={stars} onChange={setStars} />
						</Fieldset>
						<Field label="Note" hint="Optional">
							<Input
								placeholder="What did they do?"
								maxLength={300}
								value={note}
								onChange={(e) => setNote(e.target.value)}
							/>
						</Field>
						{add.isError && <p className={s.problem}>{add.error.message}</p>}
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<Button onClick={onClose}>Cancel</Button>
							<Button variant="primary" type="submit" disabled={!ready || add.isPending}>
								Save 🎉
							</Button>
						</div>
					</form>
				) : history.length === 0 ? (
					<p className={g.hint}>Nothing caught in the last {HISTORY_DAYS} days.</p>
				) : (
					<ul className={g.list}>
						{history.map((mo) => {
							const k = momentKind(mo.kind);
							const who = kids.find((kid) => kid.id === mo.memberId);
							return (
								<li key={mo.id}>
									<div className={g.item}>
										<span className={g.itemEmoji} aria-hidden="true">
											{k.emoji}
										</span>
										<span className={g.itemTitle}>
											{who?.name ?? 'Someone'} · {k.label}
											<span className={g.itemNote}>
												{day(mo.day)} · {mo.stars ? `${mo.stars} ★` : 'Sticker'}
												{mo.note && ` · ${mo.note}`}
											</span>
										</span>
										<Button variant="quiet" size="sm" onClick={() => setConfirmId(mo.id)}>
											Remove
										</Button>
									</div>
									{confirmId === mo.id && (
										<ConfirmBelow
											text={
												mo.stars
													? `Remove this? ${who?.name ?? 'Their'}'s ${mo.stars} ★ go too.`
													: 'Remove this sticker?'
											}
											busy={remove.isPending}
											onCancel={() => setConfirmId(null)}
											onConfirm={() => remove.mutate(mo.id, { onSuccess: () => setConfirmId(null) })}
										/>
									)}
								</li>
							);
						})}
					</ul>
				)}
				{tab === 'history' && remove.isError && <p className={s.problem}>{remove.error.message}</p>}
			</Sheet>
		</>
	);
}
