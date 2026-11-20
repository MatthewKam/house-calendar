import { Button } from './Button';
import s from './ConfirmBelow.module.css';

/** A confirmation that opens right below the item it's about, in place of a browser pop-up. */
export default function ConfirmBelow({
	text,
	confirmLabel = 'Remove',
	busy,
	onCancel,
	onConfirm,
}: {
	text: string;
	confirmLabel?: string;
	busy?: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div className={s.confirmBelow} role="alert">
			<span className={s.text}>{text}</span>
			<Button size="sm" onClick={onCancel}>
				Cancel
			</Button>
			<Button variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>
				{confirmLabel}
			</Button>
		</div>
	);
}
