import { feel, type Feel } from '../../lib/haptics';
import s from './styles/Switch.module.css';

/** An on/off switch: a pill with a knob, the accent when on. `label` is read out (the row shows its own title). */
export default function Switch({
	on,
	onChange,
	label,
	disabled,
	haptic,
}: {
	on: boolean;
	onChange: (on: boolean) => void;
	label: string;
	disabled?: boolean;
	/** How turning it on and off feel (lib/haptics); a tick either way unless it says otherwise. */
	haptic?: { on: Feel; off: Feel };
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			className={s.switch}
			disabled={disabled}
			onClick={() => {
				feel(haptic ? (on ? haptic.off : haptic.on) : 'select');
				onChange(!on);
			}}
		>
			<span className={s.knob} aria-hidden="true" />
		</button>
	);
}
