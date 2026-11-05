import s from "../styles/Goals.module.css";

/** − 1 ★ +: how many stars something is worth. 0 shows as a sticker (a cheer, nothing to save). */
export default function PointsStepper({ value, onChange, max = 20, label = "Stars" }: {
	value: number;
	onChange: (n: number) => void;
	max?: number;
	label?: string;
}) {
	return (
		<div className={s.stepper} role="group" aria-label={label}>
			<button type="button" className={s.step} disabled={value <= 0} aria-label="One fewer" onClick={() => onChange(value - 1)}>
				−
			</button>
			<span className={s.stepValue} aria-live="polite">
				{value === 0 ? "Sticker" : `${value} ★`}
			</span>
			<button type="button" className={s.step} disabled={value >= max} aria-label="One more" onClick={() => onChange(value + 1)}>
				+
			</button>
		</div>
	);
}
