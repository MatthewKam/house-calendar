import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { feel, tapArea } from '../../lib/haptics';
import sheet from './styles/Sheet.module.css';

/** The open sheets, oldest first: Escape closes only the top one (a confirm over a dialog). */
const open: symbol[] = [];

interface Props {
	/** What it's about, for screen readers. */
	label: string;
	/** Tapping outside it, or Escape. */
	onClose: () => void;
	children: ReactNode;
	/** Added to the sheet's own look (a narrower confirm, a wider capture). */
	className?: string;
	/** "alertdialog" for a question that has to be answered (a confirm). */
	role?: 'dialog' | 'alertdialog';
	/** A form: Enter in a field submits. */
	onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
	/** A tap for anything pressed in it (lib/haptics tapArea), and a tick on closing from outside or Escape. */
	taps?: boolean;
}

/**
 * A dialog over the page: a dimmed backdrop (a tap on it closes), the sheet itself (a form when it
 * has `onSubmit`), marked as a modal dialog, and Escape to close (only the top one when one is open
 * over another).
 */
export default function Sheet({ label, onClose, children, className, role = 'dialog', onSubmit, taps }: Props) {
	const closing = () => {
		if (taps) feel('select');
		onClose();
	};
	const close = useRef(closing);
	close.current = closing;
	useEffect(() => {
		const me = Symbol(label);
		open.push(me);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && open[open.length - 1] === me) close.current();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			open.splice(open.indexOf(me), 1);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const props = {
		className: `${sheet.sheet} ${className ?? ''}`,
		role,
		'aria-modal': true,
		'aria-label': label,
		...(taps ? tapArea : {}),
	};
	return (
		<>
			{/* A question (alertdialog) dims whatever's open under it too, not just the page. */}
			<div
				className={`${sheet.scrim} ${role === 'alertdialog' ? sheet.scrimOver : ''}`}
				onClick={closing}
				role="presentation"
			/>
			{onSubmit ? (
				<form {...props} onSubmit={onSubmit}>
					{children}
				</form>
			) : (
				<div {...props}>{children}</div>
			)}
		</>
	);
}
