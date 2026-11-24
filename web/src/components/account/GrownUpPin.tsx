import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { usePinByFace } from '../../lib/useFaceIdPin';
import PinPad, { pinSheet } from '../ui/PinPad';
import Sheet from '../ui/Sheet';
import sheet from '../ui/styles/Sheet.module.css';
import { Button } from '../ui/Button';

/**
 * A guardian's PIN, for something a kid can't do on their own: to leave kid mode, put stars in jars,
 * or more Learn today. Just checked (nothing else changes), or with `unlock`, the device is unlocked
 * for a parent's change (onOk makes it, then locks it again).
 */
export default function GrownUpPin({
	title,
	body,
	okLabel,
	unlock,
	onClose,
	onOk,
}: {
	title: string;
	body: string;
	okLabel: string;
	unlock?: boolean;
	onClose: () => void;
	onOk: () => void | Promise<void>;
}) {
	const [pin, setPin] = useState('');
	const check = useMutation({
		mutationFn: async (typed: string) => {
			await (unlock ? api.unlockParent(typed) : api.checkPin(typed));
		},
		meta: { inline: true },
	});

	// On a grown-up's own iPhone with Face ID turned on: their face instead (asked as the sheet opens).
	const byFace = usePinByFace((saved) => submit(undefined, saved, true));

	function submit(e?: FormEvent, typed = pin, face = false) {
		e?.preventDefault();
		if (!typed || check.isPending) return;
		if (!face) byFace?.typed();
		// Awaited rather than mutate's callbacks, which are dropped if the dialog re-renders from new while
		// the PIN is checked (it stayed open, with the button off, on phones).
		check.mutateAsync(typed).then(onOk, () => {
			setPin('');
			byFace?.wrong();
		});
	}

	return (
		<>
			<Sheet label={title} onClose={onClose} className={`${sheet.confirm} ${pinSheet}`} onSubmit={submit}>
				<h2 className={sheet.heading}>{title}</h2>
				<div className={sheet.body}>{body}</div>
				<PinPad
					value={pin}
					onChange={setPin}
					onEnter={(typed) => submit(undefined, typed)}
					error={check.error?.message}
					done={okLabel}
				/>
				<div className={sheet.actions}>
					{byFace && <Button onClick={byFace.ask}>Use {byFace.name}</Button>}
					<span className={sheet.spacer} />
					<Button onClick={onClose}>Cancel</Button>
					<Button variant="primary" type="submit" disabled={!pin || check.isPending}>
						{okLabel}
					</Button>
				</div>
			</Sheet>
		</>
	);
}
