import s from "../styles/Goals.module.css";

/** A confirmation that opens right below the item it's about, in place of a browser pop-up. */
export default function ConfirmBelow({ text, confirmLabel = "Remove", busy, onCancel, onConfirm }: {
	text: string;
	confirmLabel?: string;
	busy?: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div className={s.confirmBelow} role="alert">
			<span className={s.confirmText}>{text}</span>
			<button type="button" className={s.confirmCancel} onClick={onCancel}>
				Cancel
			</button>
			<button type="button" className={s.confirmYes} disabled={busy} onClick={onConfirm}>
				{confirmLabel}
			</button>
		</div>
	);
}
