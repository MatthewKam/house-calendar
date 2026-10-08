import { useEffect, type ReactNode } from "react";
import sheet from "../styles/Sheet.module.css";

interface Props {
	title: string;
	children?: ReactNode;
	/** Label for the confirm button, e.g. "Delete". */
	confirmLabel: string;
	/** Nothing is lost (e.g. putting stars in jars): the confirm button isn't red. */
	safe?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

/** Asks before something can't be undone (or, `safe`, checks it's what was meant). Cancel has focus, so a stray Enter doesn't confirm. */
export default function ConfirmDialog({ title, children, confirmLabel, safe, onConfirm, onCancel }: Props) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onCancel]);

	return (
		<>
			<div className={sheet.scrim} onClick={onCancel} role="presentation" />
			<div className={`${sheet.sheet} ${sheet.confirm}`} role="alertdialog" aria-modal="true" aria-label={title}>
				<h2 className={sheet.heading}>{title}</h2>
				{children && <div className={sheet.body}>{children}</div>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onCancel} autoFocus>
						Cancel
					</button>
					<button type="button" className={safe ? sheet.primary : sheet.destructive} onClick={onConfirm}>
						{confirmLabel}
					</button>
				</div>
			</div>
		</>
	);
}
