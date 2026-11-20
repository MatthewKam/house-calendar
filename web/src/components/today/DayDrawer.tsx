import { fromDayKey } from '../../lib/dates';
import type { SpecialDay } from '../../lib/specialDays';
import DayPlans from '../calendar/DayPlans';
import Sheet from '../ui/Sheet';
import sheet from '../ui/Sheet.module.css';
import s from './Today.module.css';
import { IconButton } from '../ui/Button';

/**
 * A special day's plans, in a drawer from the right: the note, the list and your reminders, for it
 * every year or just this day (the calendar's day panel has the same, on any day).
 */
export default function DayDrawer({
	day,
	specials,
	onClose,
}: {
	/** The one tapped. */
	day: SpecialDay;
	/** Every special day on its date. */
	specials: SpecialDay[];
	onClose: () => void;
}) {
	const date = fromDayKey(day.day);
	return (
		<Sheet label={`${day.name}: plans`} onClose={onClose} className={sheet.drawer}>
			<div className={sheet.head}>
				<div>
					<div className={s.drawerDay}>{date.toLocaleDateString([], { weekday: 'long' })}</div>
					<h2 className={sheet.heading}>{date.toLocaleDateString([], { month: 'long', day: 'numeric' })}</h2>
				</div>
				<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
			</div>
			<DayPlans day={day.day} specials={specials} start={day.key} />
		</Sheet>
	);
}
