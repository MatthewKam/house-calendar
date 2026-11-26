import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Switch from '../ui/Switch';
import ErrorBoundary from '../ui/ErrorBoundary';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from '../../lib/useMediaQuery';
import s from './styles/Settings.module.css';

// The pieces Settings is built from: its groups (each a view of its own, or one column of them that open
// in place), the parts folded inside them, the parts that are on or off, and the ⓘ beside a title.

/** ⓘ beside a title: shows what it is (and hides it again). */
export function InfoButton({ about, open, onToggle }: { about: string; open: boolean; onToggle: () => void }) {
	return (
		<button type="button" className={s.info} aria-label={`About ${about}`} aria-expanded={open} onClick={onToggle}>
			i
		</button>
	);
}

/**
 * Which group of Settings is showing (its title; null: none), and how this copy of the groups shows:
 * `rows`, the list of their rows beside the one showing; `view`, the settings of the one showing; or
 * `fold` (one column, under 900px), each a row that opens in place, one at a time.
 */
export const SettingsView = createContext<{
	view: string | null;
	open: (title: string) => void;
	close: () => void;
	mode: 'rows' | 'view' | 'fold';
}>({
	view: null,
	open: () => {},
	close: () => {},
	mode: 'rows',
});

/**
 * A group of Settings (Family, Calendars, Learning, Appearance, Screen, Notifications, Users): in the list, a row
 * (with a word on how it's set, for one that's a single thing; marked while it's the one showing beside the
 * list); in the view, its settings while it's the one picked; in one column, a row that slides open to its
 * settings (closing the one that was open) and shut again.
 */
export function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
	const { view, open, close, mode } = useContext(SettingsView);
	const isOpen = view === title;
	const row = useRef<HTMLButtonElement>(null);
	// Opened in one column: once it's slid open (and the one above shut), its row in sight.
	useEffect(() => {
		if (mode !== 'fold' || !isOpen) return;
		const t = setTimeout(() => row.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
		return () => clearTimeout(t);
	}, [mode, isOpen]);
	if (mode === 'rows') {
		return (
			<button
				type="button"
				className={s.groupRow}
				aria-current={isOpen ? 'page' : undefined}
				onClick={() => open(title)}
			>
				<span>{title}</span>
				{note && <span className={s.foldNote}>{note}</span>}
			</button>
		);
	}
	if (mode === 'fold') {
		return (
			<div className={s.groupFold}>
				<button
					ref={row}
					type="button"
					className={s.groupRow}
					aria-expanded={isOpen}
					onClick={() => (isOpen ? close() : open(title))}
				>
					<span>{title}</span>
					{note && <span className={s.foldNote}>{note}</span>}
				</button>
				<Slide open={isOpen}>
					<ErrorBoundary what={title}>{children}</ErrorBoundary>
				</Slide>
			</div>
		);
	}
	// Each group to itself: one that breaks says so, and Settings carries on.
	return isOpen ? <ErrorBoundary what={title}>{children}</ErrorBoundary> : null;
}

/** Slides open to its children and shut again, keeping them until it's shut (none while it's shut). */
function Slide({ open, children }: { open: boolean; children: ReactNode }) {
	const [shown, setShown] = useState(open);
	if (open && !shown) setShown(true);
	return (
		<div
			className={s.slide}
			data-open={open}
			onTransitionEnd={(e) => {
				if (e.target === e.currentTarget && !open) setShown(false);
			}}
		>
			<div className={s.slideInner}>{shown && children}</div>
		</div>
	);
}

/**
 * One part of a group under its heading (and a word on how it's set), folding on its own: any number
 * can be open at once (only the groups go one at a time). On a phone it starts folded, so the group
 * stays short; on a tablet or computer, with room to spare, open (but one marked `folded`).
 */
export function Section({
	title,
	note,
	folded = false,
	children,
}: {
	title: string;
	note?: string;
	/** Starts folded on a tablet or computer too (a long part, like a daily card's themes). */
	folded?: boolean;
	children: ReactNode;
}) {
	// Both asked every time (hooks can't be skipped).
	const upright = useMediaQuery(PHONE);
	const sideways = useMediaQuery(PHONE_SIDEWAYS);
	const phone = upright || sideways;
	return (
		<details className={s.fold} open={!phone && !folded}>
			<summary className={s.foldHead}>
				<span>{title}</span>
				{note && <span className={s.foldNote}>{note}</span>}
			</summary>
			<div className={s.foldBody}>{children}</div>
		</details>
	);
}

/**
 * One part of a group that's on or off: its title (with an ⓘ that shows what it does) and a switch,
 * and (on) its settings under it.
 */
export function SwitchRow({
	title,
	on,
	onChange,
	hint,
	children,
}: {
	title: string;
	on: boolean;
	onChange: (on: boolean) => void;
	hint: string;
	children?: ReactNode;
}) {
	const [info, setInfo] = useState(false);
	return (
		<div className={s.fold}>
			<div className={s.switchHead}>
				<span className={s.switchTitle}>
					{title}
					<InfoButton about={title} open={info} onToggle={() => setInfo(!info)} />
				</span>
				<Switch on={on} onChange={onChange} label={title} />
			</div>
			{info && <p className={s.switchHint}>{hint}</p>}
			{on && children && <div className={s.foldBody}>{children}</div>}
		</div>
	);
}
