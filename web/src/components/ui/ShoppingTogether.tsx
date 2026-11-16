import type { Member } from '../../lib/types';
import s from './ShoppingTogether.module.css';

// Shopping together (server/shopping.ts), on a list or a recipe: the button that turns it on (and
// says who else is shopping), and the dot beside something ticked, in the colour of who ticked it.

/** A shopper's name: theirs, or "Someone" for a device with no one signed in. */
const nameOf = (members: Member[], id: string | null) => members.find((m) => m.id === id)?.name ?? 'Someone';

/** On here: live, with whoever else is. Off: who's shopping (to join), or just the offer. */
export function ShoppingButton({
	shopping,
	me,
	members,
	onChange,
}: {
	/** Who's shopping now (null: a device with no one signed in). */
	shopping: (string | null)[];
	/** Who's on this device. */
	me: string | null;
	members: Member[];
	onChange: (on: boolean) => void;
}) {
	const here = shopping.includes(me);
	const others = shopping.filter((id) => id !== me).map((id) => nameOf(members, id));
	return (
		<button
			type="button"
			className={s.button}
			aria-pressed={here}
			onClick={() => onChange(!here)}
			title={
				here
					? 'Ticks from the other phones show straight away, for 2 hours. Tap to stop.'
					: 'Shopping with someone? Ticks show on each other’s phones straight away, for 2 hours.'
			}
		>
			🛒{' '}
			{here
				? others.length
					? `Live with ${others.join(', ')}`
					: 'Shopping together'
				: others.length
					? `${others.join(', ')} ${others.length === 1 ? 'is' : 'are'} shopping · Join`
					: 'Shopping together'}
		</button>
	);
}

/** Who ticked it: a dot in their colour, their name on a long press or hover. */
export function TickedBy({ by, members }: { by: string; members: Member[] }) {
	const name = nameOf(members, by);
	return (
		<span
			className={s.tickedBy}
			style={{ background: members.find((m) => m.id === by)?.color }}
			title={`Ticked by ${name}`}
			aria-label={`ticked by ${name}`}
		/>
	);
}
