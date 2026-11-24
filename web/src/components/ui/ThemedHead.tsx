import { useState, type ReactNode } from 'react';
import s from './styles/ThemedHead.module.css';

/**
 * A daily card's heading with an ⓘ at the end of the row: tapped, it lists the themes the card picks from
 * (or, with all of them on, says so) and where to change them.
 */
export default function ThemedHead({
	children,
	themes,
	of,
}: {
	children: ReactNode;
	/** The themes in use, of how many there are. */
	themes: { name: string }[];
	of: number;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<div className={s.head}>
				{children}
				<button
					type="button"
					className={s.info}
					aria-label="Which themes"
					aria-expanded={open}
					onClick={() => setOpen(!open)}
				>
					i
				</button>
			</div>
			{open && (
				<p className={s.note}>
					{themes.length === of ? 'From every theme' : `From ${themes.map((t) => t.name).join(', ')}`}. Pick the themes
					in Settings, Daily cards.
				</p>
			)}
		</>
	);
}
