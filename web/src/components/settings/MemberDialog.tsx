import { useState, type CSSProperties, type FormEvent } from 'react';
import { PALETTE } from '../../lib/color';
import { dayKey } from '../../lib/dates';
import { COMMON_ALLERGIES, allergyEmoji } from '../../lib/allergies';
import { STAGE_AGES, STAGE_LIST, STAGE_NAMES } from '../../lib/stages';
import type { Member, Stage } from '../../lib/types';
import Sheet from '../ui/Sheet';
import DateInput from '../ui/DateInput';
import { Chip } from '../ui/Chip';
import { Button, IconButton } from '../ui/Button';
import { Input, Select } from '../ui/Field';
import sheet from '../ui/styles/Sheet.module.css';
import s from './styles/Settings.module.css';

/** What's being changed about a person, saved together with Save. */
export interface MemberEdit {
	name: string;
	color: string;
	birthdate: string;
	stage: Stage | null;
	allergies: string[];
}

/**
 * Palette shown under the color circle when it's tapped. Palette taps are final (`done` true); the
 * rainbow dot opens the system picker, which reports every drag step (`done` false).
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
 * One person's editor, over Settings (a card in Family, tapped): name and color, birthday and stage,
 * allergies. Nothing is saved until Save; Cancel, ×, Escape or a tap outside drops it all.
 */
export default function MemberDialog({
	member,
	canColor,
	onSave,
	onRemove,
	onClose,
}: {
	member: Member;
	/** A grown-up's color is only theirs to change. */
	canColor: boolean;
	onSave: (edit: MemberEdit) => void;
	/** Removes them, deleting what's kept about them (a child, say); left out, no Remove. */
	onRemove?: () => void;
	onClose: () => void;
}) {
	// Removing is two taps.
	const [removing, setRemoving] = useState(false);
	const [edit, setEdit] = useState<MemberEdit>({
		name: member.name,
		color: member.color,
		birthdate: member.birthdate ?? '',
		stage: member.stageChosen,
		allergies: member.allergies,
	});
	// The color set, showing under the circle once it's tapped.
	const [colors, setColors] = useState(false);
	// An allergy of their own being typed (one that isn't in the common ones).
	const [ownAllergy, setOwnAllergy] = useState('');

	function addOwnAllergy() {
		const a = ownAllergy.trim().toLowerCase();
		if (a && !edit.allergies.includes(a)) setEdit({ ...edit, allergies: [...edit.allergies, a] });
		setOwnAllergy('');
	}
	function save(e: FormEvent) {
		e.preventDefault();
		if (!edit.name.trim()) return;
		onSave(edit);
	}

	return (
		<Sheet label={`Edit ${member.name}`} onClose={onClose} onSubmit={save}>
			<div className={sheet.head}>
				<h2 className={sheet.heading}>{member.name}</h2>
				<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
			</div>

			<div className={s.row}>
				{canColor ? (
					<button
						type="button"
						className={`${s.swatch} ${s.swatchEditable}`}
						style={{ background: edit.color }}
						aria-label={`Change color for ${member.name}`}
						aria-expanded={colors}
						onClick={() => setColors((open) => !open)}
					/>
				) : (
					<span className={s.swatch} style={{ background: edit.color }} aria-hidden="true" />
				)}
				<Input
					className={s.name}
					value={edit.name}
					maxLength={40}
					aria-label="Name"
					onChange={(e) => setEdit({ ...edit, name: e.target.value })}
				/>
			</div>
			{colors && (
				<ColorSet
					value={edit.color}
					label={`Color for ${member.name}`}
					onPick={(c, done) => {
						setEdit({ ...edit, color: c });
						if (done) setColors(false);
					}}
				/>
			)}

			<div className={s.details}>
				<label className={s.detail}>
					<span>Birthday</span>
					<DateInput
						aria-label="Birthday"
						value={edit.birthdate}
						max={dayKey(new Date())}
						onChange={(e) => setEdit({ ...edit, birthdate: e.target.value })}
					/>
				</label>
				<label className={s.detail}>
					<span>Stage</span>
					<Select
						value={edit.stage ?? ''}
						onChange={(e) => setEdit({ ...edit, stage: (e.target.value || null) as Stage | null })}
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

			{/* Allergies: the common ones to tap, and their own; recipes flag them. */}
			<div className={s.allergies} role="group" aria-label={`${member.name}'s allergies`}>
				<span className={s.allergiesLabel}>Allergies</span>
				<div className={s.allergyChips}>
					{[
						...COMMON_ALLERGIES.map((a) => a.name),
						...edit.allergies.filter((a) => !COMMON_ALLERGIES.some((c) => c.name === a)),
					].map((name) => {
						const on = edit.allergies.includes(name);
						return (
							<Chip
								key={name}
								icon={allergyEmoji(name)}
								pressed={on}
								onClick={() =>
									setEdit({
										...edit,
										allergies: on ? edit.allergies.filter((a) => a !== name) : [...edit.allergies, name],
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
							// Enter adds it, rather than saving the whole edit.
							if (e.key !== 'Enter') return;
							e.preventDefault();
							addOwnAllergy();
						}}
					/>
					<Button disabled={!ownAllergy.trim()} onClick={addOwnAllergy}>
						Add
					</Button>
				</div>
				<p className={s.hint}>Recipes flag them. A help, not a guarantee: check labels too.</p>
			</div>

			{removing && (
				<p className={s.hint} role="alert">
					This deletes {member.name}'s tasks, stars, jars, rewards, moments, goals and progress, and signs out their
					devices. Photos and events they're in stay, without their name.
				</p>
			)}
			<div className={sheet.actions}>
				{onRemove && (
					<Button
						variant={removing ? 'destructive' : 'danger'}
						onClick={() => (removing ? onRemove() : setRemoving(true))}
					>
						{removing ? `Remove ${member.name}` : 'Remove'}
					</Button>
				)}
				<span className={sheet.spacer} />
				<Button onClick={onClose}>Cancel</Button>
				<Button variant="primary" type="submit" disabled={!edit.name.trim()}>
					Save
				</Button>
			</div>
		</Sheet>
	);
}
