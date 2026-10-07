import s from "../styles/Fab.module.css";

/** A round + fixed at the bottom right of a page (Calendar, Tasks, Rewards) for adding something. */
export default function Fab({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button className={s.fab} onClick={onClick} aria-label={label} title={label}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 5v14M5 12h14" />
			</svg>
		</button>
	);
}
