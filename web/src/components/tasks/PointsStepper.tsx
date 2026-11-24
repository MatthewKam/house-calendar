import s from './styles/Goals.module.css';
import { IconButton } from '../ui/Button';

/** − 1 ★ +: how many stars something is worth. 0 shows as a sticker (a cheer, nothing to save). */
export default function PointsStepper({
	value,
	onChange,
	max = 20,
	label = 'Stars',
}: {
	value: number;
	onChange: (n: number) => void;
	max?: number;
	label?: string;
}) {
	return (
		<div className={s.stepper} role="group" aria-label={label}>
			<IconButton
				variant="secondary"
				icon="−"
				label="One fewer"
				disabled={value <= 0}
				onClick={() => onChange(value - 1)}
			/>
			<span className={s.stepValue} aria-live="polite">
				{value === 0 ? 'Sticker' : `${value} ★`}
			</span>
			<IconButton
				variant="secondary"
				icon="+"
				label="One more"
				disabled={value >= max}
				onClick={() => onChange(value + 1)}
			/>
		</div>
	);
}
