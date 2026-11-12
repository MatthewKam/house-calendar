import s from "../styles/Switch.module.css";

/** An on/off switch: a pill with a knob, the accent when on. `label` is read out (the row shows its own title). */
export default function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
	return (
		<button type="button" role="switch" aria-checked={on} aria-label={label} className={s.switch} disabled={disabled}
			onClick={() => onChange(!on)}>
			<span className={s.knob} aria-hidden="true" />
		</button>
	);
}
