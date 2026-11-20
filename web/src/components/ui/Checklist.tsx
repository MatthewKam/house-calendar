import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { suggestIcon } from '../../lib/emoji';
import type { ChecklistItem } from '../../lib/types';
import IconPicker from './IconPicker';
import { PencilIcon } from './icons';
import s from './Checklist.module.css';
import { Button } from './Button';
import { Input } from './Field';

interface Props {
	/** Its heading ("🎒 What to bring") and, for screen readers, `name`. */
	label: ReactNode;
	name: string;
	items: ChecklistItem[];
	/** How much is ticked ("3 of 4 packed"). */
	count: (items: ChecklistItem[]) => string;
	/** Beside the heading while changing it ("Every time it repeats"). */
	editHint: string;
	/** Under the items ("Ticks start fresh each time it repeats."). */
	footnote?: string;
	/** Ticking only: no changing the list (and nothing shown when it's empty). */
	locked?: boolean;
	/** Ticks wait while the list is being saved. */
	busy?: boolean;
	/** For a new item ("Add a thing, e.g. belt or snack") and each item's field. */
	placeholder: string;
	itemLabel: string;
	/** Pictures to start from. */
	icons: string[];
	onTick: (item: ChecklistItem, done: boolean) => void;
	/** The whole list, in order; new items have no id from the server yet. */
	onSave: (items: ChecklistItem[]) => void;
}

/**
 * A list to tick, with pictures for the kids: tick things off, or (not locked) change the list. What
 * to bring on an event (EventChecklist) and a day's list (DayPlans).
 */
export default function Checklist({
	label,
	name,
	items,
	count,
	editHint,
	footnote,
	locked,
	busy,
	placeholder,
	itemLabel,
	icons,
	onTick,
	onSave,
}: Props) {
	const [draft, setDraft] = useState<ChecklistItem[] | null>(null);
	const [typed, setTyped] = useState('');
	// Which draft row's picture is being picked.
	const [picking, setPicking] = useState<number | null>(null);

	if (!draft) {
		if (items.length === 0 && locked) return null;
		return (
			<section className={s.box} aria-label={name}>
				<div className={s.head}>
					<span className={s.label}>{label}</span>
					{items.length > 0 && <span className={s.count}>{count(items)}</span>}
					{!locked && (
						<Button size="sm" onClick={() => setDraft(items)}>
							{items.length ? (
								<>
									<PencilIcon /> Edit
								</>
							) : (
								'+ Add a list'
							)}
						</Button>
					)}
				</div>
				{items.length > 0 && (
					<ul className={s.items}>
						{items.map((x) => (
							<li key={x.id}>
								<button
									type="button"
									className={`${s.item} ${x.done ? s.done : ''}`}
									aria-pressed={x.done}
									disabled={busy}
									onClick={() => onTick(x, !x.done)}
								>
									<span className={s.tick} aria-hidden="true">
										{x.done ? '✓' : ''}
									</span>
									<Picture item={x} />
									<span className={s.title}>{x.title}</span>
								</button>
							</li>
						))}
					</ul>
				)}
				{items.length > 0 && footnote && <p className={s.note}>{footnote}</p>}
			</section>
		);
	}

	const change = (i: number, patch: Partial<ChecklistItem>) =>
		setDraft(draft.map((x, j) => (j === i ? { ...x, ...patch } : x)));
	function add() {
		const title = typed.trim();
		if (!title) return;
		setDraft([...draft!, { id: `new-${Date.now()}`, title, picture: suggestIcon(title), done: false }]);
		setTyped('');
	}
	// Enter adds the item, rather than saving a form it sits in.
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			add();
		}
	};
	function done() {
		// Something typed but not added yet counts too. New ones get their ids from the server.
		onSave(
			[
				...draft!,
				...(typed.trim()
					? [{ id: `new-${Date.now()}`, title: typed.trim(), picture: suggestIcon(typed), done: false }]
					: []),
			].filter((x) => x.title.trim()),
		);
		setDraft(null);
		setTyped('');
		setPicking(null);
	}

	return (
		<section className={s.box} aria-label={name}>
			<div className={s.head}>
				<span className={s.label}>{label}</span>
				<span className={s.count}>{editHint}</span>
			</div>
			<ul className={s.items}>
				{draft.map((x, i) => (
					<li key={x.id} className={s.editRow}>
						<button
							type="button"
							className={s.pick}
							aria-label={`Picture for ${x.title}`}
							onClick={() => setPicking(picking === i ? null : i)}
						>
							{x.picture || suggestIcon(x.title) ? <Picture item={x} /> : <span className={s.noPicture}>+</span>}
						</button>
						<Input
							className={s.input}
							value={x.title}
							maxLength={80}
							aria-label={itemLabel}
							onChange={(e) => change(i, { title: e.target.value })}
							onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
						/>
						<button
							type="button"
							className={s.remove}
							aria-label={`Remove ${x.title}`}
							onClick={() => {
								setDraft(draft.filter((_, j) => j !== i));
								setPicking(null);
							}}
						>
							×
						</button>
						{picking === i && (
							<div className={s.picker}>
								<IconPicker
									value={x.picture}
									featured={[...new Set([suggestIcon(x.title), ...icons].filter((p): p is string => !!p))]}
									onChange={(picture) => {
										change(i, { picture });
										setPicking(null);
									}}
								/>
							</div>
						)}
					</li>
				))}
				<li className={s.editRow}>
					<span className={s.pick} aria-hidden="true">
						{suggestIcon(typed) ?? <span className={s.noPicture}>+</span>}
					</span>
					<Input
						className={s.input}
						value={typed}
						maxLength={80}
						placeholder={placeholder}
						aria-label={`Add: ${itemLabel.toLowerCase()}`}
						autoFocus={draft.length === 0}
						onChange={(e) => setTyped(e.target.value)}
						onKeyDown={onKey}
					/>
					<Button onClick={add} disabled={!typed.trim()}>
						Add
					</Button>
				</li>
			</ul>
			<div className={s.actions}>
				<Button
					variant="quiet"

					onClick={() => {
						setDraft(null);
						setTyped('');
						setPicking(null);
					}}
				>
					Cancel
				</Button>
				<Button variant="primary" onClick={done}>
					Save list
				</Button>
			</div>
		</section>
	);
}

/** Its picture, or (lighter) the one guessed from its name until one's picked. */
function Picture({ item }: { item: ChecklistItem }) {
	const guess = item.picture ? null : suggestIcon(item.title);
	if (!item.picture && !guess) return null;
	return (
		<span className={`${s.picture} ${guess ? s.guess : ''}`} aria-hidden="true">
			{item.picture ?? guess}
		</span>
	);
}
