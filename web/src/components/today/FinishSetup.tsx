import { useState } from 'react';
import { useAuthStatus, useCalendars, useMembers, useTasks } from '../../lib/queries';
import { isKid } from '../../lib/people';
import { Calendar, Invite, Kids, Tasks } from '../account/Setup';
import Sheet from '../ui/Sheet';
import s from './Today.module.css';
import a from '../account/Account.module.css';

const STEPS = {
	kids: { icon: '👶', text: 'Add your kids' },
	tasks: { icon: '⭐', text: 'Pick starter tasks for the kids' },
	calendar: { icon: '📅', text: 'Share your calendar' },
	invite: { icon: '💌', text: 'Invite the other parent' },
};
type Step = keyof typeof STEPS;

const hiddenKey = (household: string) => `sprig:setup-hidden:${household}`;

/**
 * Today's "Finish setting up": the setup steps still to do (no kids yet, no tasks, no calendar, one parent),
 * each opening that step from Setup in a sheet. Guardians only; gone once everything's done, or hidden.
 */
export default function FinishSetup() {
	const auth = useAuthStatus().data;
	const members = useMembers().data;
	const tasks = useTasks().data;
	const calendars = useCalendars().data;
	const household = auth?.signedIn ? auth.household : null;
	const [hidden, setHidden] = useState(() => {
		try {
			return !!household && localStorage.getItem(hiddenKey(household.id)) === '1';
		} catch {
			return false;
		}
	});
	const [open, setOpen] = useState<Step | null>(null);
	// Only for a guardian's own device, and only once everything it looks at has loaded.
	// Not in the site's demo: its family is made up, and invites and calendars are off there.
	if (!auth?.signedIn || auth.kind !== 'user' || auth.role !== 'guardian' || !household || hidden || auth.demo)
		return null;
	if (!members || !tasks || !calendars) return null;

	const kids = members.filter(isKid);
	const left: Step[] = [];
	if (kids.length === 0) left.push('kids');
	else if (tasks.length === 0) left.push('tasks');
	if (calendars.length === 0) left.push('calendar');
	if (members.filter((m) => m.guardian).length < 2) left.push('invite');
	if (left.length === 0 && !open) return null;

	const hide = () => {
		try {
			localStorage.setItem(hiddenKey(household.id), '1');
		} catch {
			// Hidden until the app reloads.
		}
		setHidden(true);
	};
	const close = () => setOpen(null);

	return (
		<section className={s.card} aria-label="Finish setting up">
			<div className={s.cardTop}>
				<h2 className={s.cardHead}>Finish setting up</h2>
				<button type="button" className={s.hideSetup} onClick={hide}>
					Hide
				</button>
			</div>
			<ul className={s.needs}>
				{left.map((step) => (
					<li key={step}>
						<button type="button" className={s.need} onClick={() => setOpen(step)}>
							<span aria-hidden="true">{STEPS[step].icon}</span>
							{STEPS[step].text}
						</button>
					</li>
				))}
			</ul>
			{open && (
				<Sheet label={STEPS[open].text} onClose={close}>
					<div className={a.column}>
						{open === 'kids' && <Kids kids={kids} last onNext={close} />}
						{open === 'tasks' && <Tasks kids={kids} onNext={close} />}
						{open === 'calendar' && <Calendar joined={false} last onNext={close} />}
						{open === 'invite' && <Invite household={household.name} onNext={close} />}
					</div>
				</Sheet>
			)}
		</section>
	);
}
