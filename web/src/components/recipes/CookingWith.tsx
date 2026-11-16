import { useEffect, useState } from 'react';
import type { CookPerson } from '../../../../shared/cook.ts';
import { progressWords } from '../../lib/cook';
import { PersonDot } from '../ui/ShoppingTogether';
import s from './Recipes.module.css';

// Cooking together: the others cooking along (not this device), each with how far they've got and
// their timers, and the dots beside what they've done. Nothing here changes anyone's own ticks.

/** Everyone else cooking along, a line each. */
export function CookingWith({
	others,
	steps,
	ingredients,
}: {
	others: CookPerson[];
	steps: number;
	ingredients: number;
}) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const tick = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(tick);
	}, []);
	if (!others.length) return <p className={s.hint}>No one else yet. Send the link, and they’ll show here.</p>;
	return (
		<ul className={s.cookingWith} aria-label="Cooking along">
			{others.map((p) => (
				<li key={p.cookId}>
					<span className={s.cookDot} style={{ background: p.color }} aria-hidden="true" />
					<b>{p.name}</b>
					<span>{progressWords(p, steps, ingredients, now)}</span>
				</li>
			))}
		</ul>
	);
}

/** The others' dots beside an ingredient they've prepped or a step they've done. */
export function DoneBy({ others, done }: { others: CookPerson[]; done: (p: CookPerson) => boolean }) {
	return others.filter(done).map((p) => <PersonDot key={p.cookId} name={p.name} color={p.color} what="Done" />);
}
