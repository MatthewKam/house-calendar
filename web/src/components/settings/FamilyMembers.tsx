import { useState, type CSSProperties, type FormEvent } from 'react';
import { PALETTE } from '../../lib/color';
import { dayKey } from '../../lib/dates';
import { useAuthStatus, useSetMemberColor, useUpdateMember } from '../../lib/queries';
import { STAGE_AGES, STAGE_LIST, STAGE_NAMES } from '../../lib/stages';
import type { Member, MemberPatch, Stage } from '../../lib/types';
import ColorAsked from '../account/ColorAsked';
import { COMMON_ALLERGIES, allergyEmoji } from '../../lib/allergies';
import DateInput from '../ui/DateInput';
import s from './styles/Settings.module.css';
import { PencilIcon } from '../ui/icons';
import { Chip } from '../ui/Chip';
import { Button, IconButton } from '../ui/Button';
import { Input, Select } from '../ui/Field';

/**
 * Palette shown under a row when its color circle is tapped. Palette taps are final (`done` true);
 * the rainbow dot opens the system picker, which reports every drag step (`done` false).
 */
function ColorSet({
	value,
	label,
	onPick,
}: {
	value: string;
	label: string;
	onPick: (color: string, done: boolean) => void;
}) {
	const isCustom = !PALETTE.includes(value);
	return (
		<div className={s.palette} role="radiogroup" aria-label={label}>
			{PALETTE.map((c) => (
				<button
					key={c}
					type="button"
					role="radio"
					aria-checked={value === c}
					aria-label={c}
					className={`${s.dot} ${value === c ? s.picked : ''}`}
					style={{ '--c': c } as CSSProperties}
					onClick={() => onPick(c, true)}
				/>
			))}
			<label
				className={`${s.dot} ${s.custom} ${isCustom ? s.picked : ''}`}
				style={{ '--c': isCustom ? value : undefined } as CSSProperties}
				title="Other color"
			>
				<input type="color" value={value} aria-label="Other color" onChange={(e) => onPick(e.target.value, false)} />
			</label>
		</div>
	);
}

/**
 * The family (Settings, Family): each person with their color, name and stage; the pencil opens one
 * to change their name, color, birthday and stage, saved together with Save. People's colors are the
 * household's: the account holder's changes are made, anyone else's asked for (ColorAsked shows one
 * waiting). People join with an invite (Settings, Users), not here.
 */
export default function FamilyMembers({ members }: { members: Member[] }) {
	const auth = useAuthStatus().data;
	const updateMember = useUpdateMember();
	const setColor = useSetMemberColor();
	// Signed out there's no holder. A grown-up's color is only theirs to change.
	const holder = !auth?.signedIn || auth.holder;
	const canColor = (m: Member) => !auth?.signedIn || !m.guardian || m.id === auth.memberId;
	// Person being edited (opened with the pencil), one at a time. Name, color, birthday, stage and
	// allergies are saved together with Save, and Cancel drops them all.
	const [editing, setEditing] = useState<{
		id: string;
		name: string;
		color: string;
		birthdate: string;
		stage: Stage | null;
		allergies: string[];
	} | null>(null);
	// An allergy of their own being typed (one that isn't in the common ones).
	const [ownAllergy, setOwnAllergy] = useState('');
	// Whose color set is showing (a member id), or null.
	const [openSet, setOpenSet] = useState<string | null>(null);
	function startEdit(m: Member) {
		setEditing({
			id: m.id,
			name: m.name,
			color: m.color,
			birthdate: m.birthdate ?? '',
			stage: m.stageChosen,
			allergies: m.allergies,
		});
		setOwnAllergy('');
		setOpenSet(null);
	}
	function stopEdit() {
		setEditing(null);
		setOpenSet(null);
	}
	function saveEdit(e: FormEvent, m: Member) {
		e.preventDefault();
		if (!editing) return;
		const name = editing.name.trim();
		const patch: MemberPatch = {};
		if (name && name !== m.name) patch.name = name;
		if ((editing.birthdate || null) !== m.birthdate) patch.birthdate = editing.birthdate || null;
		if (editing.stage !== m.stageChosen) patch.stage = editing.stage;
		if (editing.allergies.join() !== m.allergies.join()) patch.allergies = editing.allergies;
		if (Object.keys(patch).length) updateMember.mutate({ id: m.id, patch });
		if (editing.color !== m.color) setColor.mutate({ id: m.id, color: editing.color, holder });
		stopEdit();
	}

	return (
		<>
			<p className={s.hint}>
				Tap the pencil to change a name, color or birthday. A birthday sets each kid's stage, which decides how they
				earn stars.
				{!holder && auth?.signedIn && ` A new color waits for ${auth.holderName ?? 'the account holder'} to OK it.`}
			</p>

			<ul className={s.list}>
				{members.map((m) => {
					const isEditing = editing?.id === m.id;
					const color = isEditing ? editing.color : m.color;
					return (
						<li key={m.id} className={s.member}>
							<div className={s.row}>
								{/* The color can only be changed while editing. */}
								{isEditing && canColor(m) ? (
									<button
										type="button"
										className={`${s.swatch} ${s.swatchEditable}`}
										style={{ background: color }}
										aria-label={`Change color for ${m.name}`}
										aria-expanded={openSet === m.id}
										onClick={() => setOpenSet((open) => (open === m.id ? null : m.id))}
									/>
								) : (
									<span className={s.swatch} style={{ background: color }} aria-hidden="true" />
								)}
								{isEditing ? (
									<form className={s.editName} onSubmit={(e) => saveEdit(e, m)}>
										<Input
											className={s.name}
											value={editing.name}
											maxLength={40}
											autoFocus
											aria-label={`Name for ${m.name}`}
											onChange={(e) => setEditing({ ...editing, name: e.target.value })}
											onKeyDown={(e) => {
												// Escape cancels the edit without closing Settings.
												if (e.key === 'Escape') {
													e.stopPropagation();
													stopEdit();
												}
											}}
										/>
										<Button variant="primary" type="submit" disabled={!editing.name.trim()}>
											Save
										</Button>
										<Button onClick={stopEdit}>Cancel</Button>
									</form>
								) : (
									<>
										<span className={s.nameText}>
											{m.name}
											{m.stage && <span className={s.stageTag}>{STAGE_NAMES[m.stage]}</span>}
											{m.allergies.length > 0 && <span className={s.allergyTag}>⚠ {m.allergies.join(', ')}</span>}
										</span>
										<IconButton
											className={s.editButton}
											label={`Edit ${m.name}`}
											icon={<PencilIcon />}
											onClick={() => startEdit(m)}
										/>
									</>
								)}
							</div>
							{isEditing && (
								<div className={s.details}>
									<label className={s.detail}>
										<span>Birthday</span>
										<DateInput
											aria-label="Birthday"
											value={editing.birthdate}
											max={dayKey(new Date())}
											onChange={(e) => setEditing({ ...editing, birthdate: e.target.value })}
										/>
									</label>
									<label className={s.detail}>
										<span>Stage</span>
										<Select
											value={editing.stage ?? ''}
											onChange={(e) => setEditing({ ...editing, stage: (e.target.value || null) as Stage | null })}
										>
											<option value="">From birthday</option>
											{STAGE_LIST.map((st) => (
												<option key={st} value={st}>
													{STAGE_NAMES[st]} ({STAGE_AGES[st]})
												</option>
											))}
										</Select>
									</label>
								</div>
							)}
							{/* Allergies: the common ones to tap, and their own; recipes flag them. */}
							{isEditing && (
								<div className={s.allergies} role="group" aria-label={`${m.name}'s allergies`}>
									<span className={s.allergiesLabel}>Allergies</span>
									<div className={s.allergyChips}>
										{[
											...COMMON_ALLERGIES.map((a) => a.name),
											...editing.allergies.filter((a) => !COMMON_ALLERGIES.some((c) => c.name === a)),
										].map((name) => {
											const on = editing.allergies.includes(name);
											return (
												<Chip
													key={name}
													icon={allergyEmoji(name)}
													pressed={on}
													onClick={() =>
														setEditing({
															...editing,
															allergies: on
																? editing.allergies.filter((a) => a !== name)
																: [...editing.allergies, name],
														})
													}
												>
													{name}
												</Chip>
											);
										})}
									</div>
									<div className={s.row}>
										<Input
											className={s.name}
											placeholder="Another one (strawberries)"
											aria-label="Another allergy"
											value={ownAllergy}
											maxLength={40}
											onChange={(e) => setOwnAllergy(e.target.value)}
											onKeyDown={(e) => {
												if (e.key !== 'Enter') return;
												e.preventDefault();
												const a = ownAllergy.trim().toLowerCase();
												if (a && !editing.allergies.includes(a))
													setEditing({ ...editing, allergies: [...editing.allergies, a] });
												setOwnAllergy('');
											}}
										/>
										<Button
											disabled={!ownAllergy.trim()}
											onClick={() => {
												const a = ownAllergy.trim().toLowerCase();
												if (a && !editing.allergies.includes(a))
													setEditing({ ...editing, allergies: [...editing.allergies, a] });
												setOwnAllergy('');
											}}
										>
											Add
										</Button>
									</div>
									<p className={s.hint}>Recipes flag them. A help, not a guarantee: check labels too.</p>
								</div>
							)}
							{!isEditing && m.colorAsked && <ColorAsked member={m} />}
							{isEditing && openSet === m.id && (
								<ColorSet
									value={color}
									label={`Color for ${m.name}`}
									onPick={(c, done) => {
										setEditing({ ...editing, color: c });
										if (done) setOpenSet(null);
									}}
								/>
							)}
						</li>
					);
				})}
			</ul>
		</>
	);
}
