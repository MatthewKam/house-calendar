import { useState, type FormEvent } from 'react';
import { useSetSetting, useSettings } from '../../lib/queries';
import s from './Settings.module.css';
import { PencilIcon } from '../ui/icons';
import { Button, IconButton } from '../ui/Button';
import { Input } from '../ui/Field';

/** Where travel times start from. Saved with Save, so a half-typed address isn't used. */
export default function HomeAddress() {
	const saved = (useSettings().data?.homeAddress as string | undefined) ?? '';
	const setSetting = useSetSetting();
	// The address being typed; null shows the saved one behind the pencil. With nothing saved yet,
	// the field is open straight away.
	const [draft, setDraft] = useState<string | null>(null);
	const editing = draft !== null || !saved;
	const value = draft ?? saved;
	function save(e: FormEvent) {
		e.preventDefault();
		if (value.trim() !== saved) setSetting.mutate({ key: 'homeAddress', value: value.trim() });
		setDraft(null);
	}
	return (
		<section className={s.bare}>
			<p className={s.hint}>Travel times to events start here.</p>
			{editing ? (
				<form className={s.row} onSubmit={save}>
					<Input
						className={s.name}
						placeholder="e.g. 1 Main St, Irvine, CA"
						value={value}
						maxLength={300}
						autoFocus={!!saved}
						onChange={(e) => setDraft(e.target.value)}
						aria-label="Home address"
						onKeyDown={(e) => {
							if (e.key === 'Escape' && saved) {
								e.stopPropagation();
								setDraft(null);
							}
						}}
					/>
					<Button variant="primary" type="submit" disabled={!value.trim() || value.trim() === saved}>
						Save
					</Button>
					{saved && <Button onClick={() => setDraft(null)}>Cancel</Button>}
				</form>
			) : (
				<div className={s.row}>
					<span className={s.nameText}>{saved}</span>
					<IconButton
						className={s.editButton}
						label="Edit home address"
						icon={<PencilIcon />}
						onClick={() => setDraft(saved)}
					/>
				</div>
			)}
		</section>
	);
}
