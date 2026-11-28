import { useState } from 'react';
import { useAuthStatus, useCalendars, useMembers, useTasks } from '../../lib/queries';
import { isKid } from '../../lib/people';
import { Alerts, Calendar, Invite, Kids, Tasks } from '../account/Setup';
import { usePush } from '../../lib/usePush';
import type { Member } from '../../lib/types';
import Sheet from '../ui/Sheet';
import s from './Today.module.css';
import a from '../account/styles/Account.module.css';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const STEPS = {
	kids: { icon: '👶', text: 'Add your kids' },
	tasks: { icon: '⭐', text: 'Pick starter tasks for the kids' },
	calendar: { icon: '📅', text: 'Share your calendar' },
	alerts: { icon: '🔔', text: 'Turn on alerts' },
	invite: { icon: '💌', text: 'Invite the other parent' },
};
type Step = keyof typeof STEPS;

const hiddenKey = (household: string) => `sprig:setup-hidden:${household}`;

/**
 * Today's "Finish setting up": the setup steps still to do (no kids yet, no tasks, no calendar, alerts off on
 * this device, one parent), each opening that step from Setup in a sheet. Guardians only; gone once
 * everything's done, or hidden.
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
	// Only for a guardian's own device, and only once everything it looks at has loaded.
	// Not in the site's demo: its family is made up, and invites and calendars are off there.
	if (!auth?.signedIn || auth.kind !== 'user' || auth.role !== 'guardian' || !household || hidden || auth.demo)
		return null;
	if (!members || !tasks || !calendars) return null;
	return (
		<Steps household={household} members={members} tasks={tasks} calendars={calendars} onHide={() => setHidden(true)} />
	);
}

/** The card itself, once it's this guardian's to see (alerts are only looked up then). */
function Steps({
	household,
	members,
	tasks,
	calendars,
	onHide,
}: {
	household: { id: string; name: string };
	members: Member[];
	tasks: unknown[];
	calendars: unknown[];
	onHide: () => void;
}) {
	const push = usePush();
	const [open, setOpen] = useState<Step | null>(null);
	const kids = members.filter(isKid);
	const left: Step[] = [];
	if (kids.length === 0) left.push('kids');
	else if (tasks.length === 0) left.push('tasks');
	if (calendars.length === 0) left.push('calendar');
	if (push.state === 'off') left.push('alerts');
	if (members.filter((m) => m.guardian).length < 2) left.push('invite');
	if (left.length === 0 && !open) return null;

	const hide = () => {
		try {
			localStorage.setItem(hiddenKey(household.id), '1');
		} catch {
			// Hidden until the app reloads.
		}
		onHide();
	};
	const close = () => setOpen(null);

	return (
		<Card
			title="Finish setting up"
			action={
				<Button variant="quiet" size="sm" onClick={hide}>
					Hide
				</Button>
			}
		>
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
						{open === 'alerts' && <Alerts push={push} last onNext={close} />}
						{open === 'invite' && <Invite household={household.name} onNext={close} />}
					</div>
				</Sheet>
			)}
		</Card>
	);
}
