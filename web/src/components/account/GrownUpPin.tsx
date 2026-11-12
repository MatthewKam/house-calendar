import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import PinPad, { pinSheet } from '../ui/PinPad';
import Sheet from '../ui/Sheet';
import sheet from '../ui/Sheet.module.css';

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

	function submit(e?: FormEvent, typed = pin) {
		e?.preventDefault();
		if (!typed || check.isPending) return;
		// Awaited rather than mutate's callbacks, which are dropped if the dialog re-renders from new while
		// the PIN is checked (it stayed open, with the button off, on phones).
		check.mutateAsync(typed).then(onOk, () => setPin(''));
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
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className={sheet.primary} disabled={!pin || check.isPending}>
						{okLabel}
					</button>
				</div>
			</Sheet>
		</>
	);
}
