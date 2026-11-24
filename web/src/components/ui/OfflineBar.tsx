import { useMutationState } from '@tanstack/react-query';
import { useGettingThrough, useOnline } from '../../lib/useOnline';
import s from './styles/OfflineBar.module.css';

/**
 * Offline, or a signal too weak to get through: a small note at the top of every screen, so nothing just
 * quietly doesn't work or goes out of step with the family's phones. What's on screen is what was loaded
 * last; offline, edits wait on this device and save once it's back (the count says how many are waiting).
 */
export default function OfflineBar() {
	const online = useOnline();
	const through = useGettingThrough();
	const waiting = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length;
	if (online && through) return null;
	if (online) {
		return (
			<div className={s.bar} role="status">
				<span aria-hidden="true">📶</span>
				<span>Weak signal: not syncing, so others’ changes may not show yet.</span>
			</div>
		);
	}
	return (
		<div className={s.bar} role="status">
			<span aria-hidden="true">☁️</span>
			<span>
				Offline.{' '}
				{waiting > 0
					? `${waiting} ${waiting === 1 ? 'change' : 'changes'} will save when you’re back.`
					: 'Changes save when you’re back.'}
			</span>
		</div>
	);
}
