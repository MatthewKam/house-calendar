import { type ReactNode } from 'react';
import sheet from './Sheet.module.css';
import Sheet from './Sheet';

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
	return (
		<>
			<Sheet label={title} onClose={onCancel} className={sheet.confirm} role="alertdialog">
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
			</Sheet>
		</>
	);
}
