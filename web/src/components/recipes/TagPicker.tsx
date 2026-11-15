import { useState } from 'react';
import { COMMON_TAGS, tagEmoji } from '../../lib/recipes';
import Sheet from '../ui/Sheet';
import sheet from '../ui/Sheet.module.css';
import s from './Recipes.module.css';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A recipe's tags from the family: the common ones to tap (Kid approved, Freezes well), the family's own
 * from the rest of the book, and a new one typed. Saved all at once.
 */
export default function TagPicker({
	initial,
	known,
	onSave,
	onClose,
}: {
	initial: string[];
	/** Tags used anywhere in the book, so the family's own come back to tap. */
	known: string[];
	onSave: (tags: string[]) => void;
	onClose: () => void;
}) {
	const [tags, setTags] = useState(initial);
	const [typed, setTyped] = useState('');
	const own = [...known, ...initial].filter(
		(t, i, all) => !COMMON_TAGS.some((c) => same(c.name, t)) && all.findIndex((x) => same(x, t)) === i,
	);
	const choices = [...COMMON_TAGS.map((c) => c.name), ...own, ...tags.filter((t) => !own.some((o) => same(o, t)))];
	const unique = choices.filter((t, i) => choices.findIndex((x) => same(x, t)) === i);
	const on = (t: string) => tags.some((x) => same(x, t));
	const toggle = (t: string) => setTags(on(t) ? tags.filter((x) => !same(x, t)) : [...tags, t]);
	const addTyped = () => {
		const t = typed.trim().replace(/\s+/g, ' ');
		if (t && !on(t)) setTags([...tags, t]);
		setTyped('');
	};

	return (
		<Sheet
			label="Tags"
			onClose={onClose}
			onSubmit={(e) => {
				e.preventDefault();
				// Enter in the box adds what's typed; Save keeps it all.
				addTyped();
			}}
		>
			<header className={sheet.head}>
				<h2 className={sheet.heading}>Tags</h2>
				<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
					×
				</button>
			</header>
			<p className={s.hint}>
				Tap to add or take off. They show on the recipe's card, and the book can be narrowed by them.
			</p>
			<div className={s.tagChoices}>
				{unique.map((t) => (
					<button key={t} type="button" className={s.chip} aria-pressed={on(t)} onClick={() => toggle(t)}>
						<span aria-hidden="true">{tagEmoji(t)}</span> {t}
					</button>
				))}
			</div>
			<div className={s.tagNew}>
				<input
					className={s.ideasInput}
					placeholder="Your own (Pizza Friday)"
					aria-label="Your own tag"
					maxLength={30}
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
				/>
				<button type="submit" className={sheet.secondary} disabled={!typed.trim()}>
					Add
				</button>
			</div>
			<div className={sheet.actions}>
				<span className={sheet.spacer} />
				<button type="button" className={sheet.secondary} onClick={onClose}>
					Cancel
				</button>
				<button
					type="button"
					className={sheet.primary}
					onClick={() => {
						const t = typed.trim().replace(/\s+/g, ' ');
						onSave(t && !on(t) ? [...tags, t] : tags);
					}}
				>
					Save
				</button>
			</div>
		</Sheet>
	);
}
