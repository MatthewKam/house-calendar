import s from "../../styles/Learn.module.css";

/** How far through: a dot per round, filled once done. */
export function Dots({ total, done }: { total: number; done: number }) {
	return (
		<div className={s.dots} role="img" aria-label={`${done} of ${total} done`}>
			{Array.from({ length: total }, (_, i) => (
				<span key={i} className={`${s.dot} ${i < done ? s.dotOn : ""}`} />
			))}
		</div>
	);
}

/** Next, once the round's got (room kept for it, so nothing jumps). */
export function Next({ show, onNext, last }: { show: boolean; onNext: () => void; last: boolean }) {
	return (
		<div className={s.nextSpace}>
			{show && (
				<button type="button" className={s.next} onClick={onNext}>
					{last ? "Done!" : "Next"}
				</button>
			)}
		</div>
	);
}
