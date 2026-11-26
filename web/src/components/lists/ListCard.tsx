import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useMutationState } from '@tanstack/react-query';
import { LISTS, useChangeReminders, useListActions } from '../../lib/queries';
import type { Member, ReminderList } from '../../lib/types';
import { ago } from '../../lib/dates';
import { dueLabel, isLate, LIST_COLORS } from '../../lib/lists';
import { splitIcon, suggestIcon } from '../../lib/emoji';
import { useParent } from '../../lib/useParent';
import { useFolded } from '../../lib/useFolded';
import IconPicker from '../ui/IconPicker';
import SortableList, { type HandleProps } from '../ui/SortableList';
import { GripIcon, PencilIcon } from '../ui/icons';
import Sheet from '../ui/Sheet';
import { ShoppingButton, TickedBy } from '../ui/ShoppingTogether';
import { Button, IconButton } from '../ui/Button';
import { Input } from '../ui/Field';
import sheet from '../ui/styles/Sheet.module.css';
import { iconChoices, ItemSheet, ListSheet, REMINDERS_ICON_NOTE } from './ListSheets';
import s from './ListView.module.css';

/** An item's place in the saved order: its name without the icon, ignoring case. */
const keyOf = (title: string) => splitIcon(title).text.trim().toLowerCase();

/** How long a tapped item waits in its place, ticked or not, before it slides to its new one (ms). */
const WAIT_TICKED = 300;
const WAIT_UNTICKED = 250;

/**
 * Moves a card's rows to their new places by sliding each from where it was: measures every row
 * (data-row), makes the change, then glides each moved row from its old place to its new one. Only the
 * rows move, inside the page, so nothing flashes or shows over the bar at the bottom. The tapped rows
 * start slowly, so they're seen to go, take longer the further they go, and pass over the others.
 */
function slideRows(card: HTMLElement | null, tapped: Set<string>, change: () => void) {
	const rows = () => [...(card?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];
	const before = new Map(rows().map((el) => [el.dataset.row, el.getBoundingClientRect().top]));
	flushSync(change);
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	for (const el of rows()) {
		const was = before.get(el.dataset.row);
		const by = was === undefined ? 0 : was - el.getBoundingClientRect().top;
		if (Math.abs(by) < 1) continue;
		const mine = tapped.has(el.dataset.row!);
		el.animate(
			[
				{ transform: `translateY(${by}px)`, zIndex: mine ? 3 : 'auto' },
				{ transform: 'none', zIndex: mine ? 3 : 'auto' },
			],
			mine
				? { duration: Math.min(900, 350 + Math.abs(by) * 0.5), easing: 'cubic-bezier(0.5, 0, 0.25, 1)' }
				: { duration: 300, easing: 'ease-out' },
		);
	}
}

/**
 * A list on the page: one of Sprig's own (server/lists.ts), or an iCloud Reminders list synced by
 * the Shortcut. Both show the same; Sprig's items can also say when and who.
 */
export interface CardList {
	source: 'sprig' | 'reminders';
	/** Sprig: the list's id. Reminders: its name. */
	id: string;
	title: string;
	items: CardItem[];
	syncedBy: ReminderList['syncedBy'];
	/** Sprig's: who's shopping from it together now (null: a device with no one signed in). */
	shopping: (string | null)[];
	/** Sprig's: sort by unchecked first (ticked ones slide to the bottom); otherwise items stay in place. */
	sortUnchecked?: boolean;
}
export interface CardItem {
	id: string;
	title: string;
	done: boolean;
	due: string | null;
	/** Reminders: changed here and waiting for a phone. */
	pending?: boolean;
	memberId?: string | null;
	/** Sprig's: who ticked it, and when. */
	doneBy?: string | null;
	doneAt?: string | null;
	/** Sprig's: the section it's under (the recipe it was added for); none, with the list's other items. */
	section?: string | null;
}

interface CardProps {
	list: CardList;
	members: Member[];
	/** Who's on this device (null: no one in particular, the wall say). */
	me: string | null;
	/** Shopping together turned on or off here, from this list. */
	onShopping: (on: boolean) => void;
	color: string;
	onColor: (color: string) => void;
	/** Item names in the order they were dragged into (kept on the wall). */
	order: string[];
	onReorder: (order: string[]) => void;
}

export default function ListCard({ list, members, me, onShopping, color, onColor, order, onReorder }: CardProps) {
	const reminders = useChangeReminders();
	const own = useListActions();
	const sprig = list.source === 'sprig';
	// The same three changes either way: to Sprig's list, or queued for Reminders.
	const add = {
		mutate: (v: { title: string }) =>
			sprig
				? own.add.mutate({ listId: list.id, title: v.title })
				: reminders.add.mutate({ list: list.title, title: v.title }),
		isPending: sprig ? own.add.isPending : reminders.add.isPending,
	};
	const setDone = {
		mutate: (v: { id: string; done: boolean }) => (sprig ? own.update.mutate(v) : reminders.setDone.mutate(v)),
	};
	const rename = {
		mutate: (v: { id: string; title: string }) => (sprig ? own.update.mutate(v) : reminders.rename.mutate(v)),
	};
	const problem = sprig
		? (own.add.error ?? own.update.error ?? own.clearDone.error)
		: (reminders.add.error ?? reminders.setDone.error ?? reminders.rename.error);
	// An item's name and icon (and on Sprig's lists, when and who) open in a sheet, as does the list's name.
	const [details, setDetails] = useState<CardItem | null>(null);
	const [settingUp, setSettingUp] = useState(false);
	// Adding, ticking and editing an item are anyone's; colors and order need a parent.
	const { parent } = useParent();
	const [choosingColor, setChoosingColor] = useState(false);
	// Items stay in place when ticked, unless the list sorts unchecked first (its ⋯). Then tapped items
	// wait a moment where they were, ticked or not, so the tick is seen; then every row slides to its new
	// place: ticked ones to the very bottom, unticked ones to the end of the open ones. While waiting, the
	// rows keep the order they had at the first tap (by id), and each tapped item stays open or done as it
	// was shown (pinned).
	const sorted = !!list.sortUnchecked;
	// Just ticked, in place: its ✓ pops.
	const [popped, setPopped] = useState<string | null>(null);
	const [held, setHeld] = useState<{ order: Map<string, number>; pinned: Map<string, boolean> } | null>(null);
	const card = useRef<HTMLElement>(null);
	const wait = useRef<ReturnType<typeof setTimeout>>(undefined);
	const tapped = useRef(new Set<string>());
	useEffect(() => () => clearTimeout(wait.current), []);
	const isOpen = (it: CardItem) => !sorted || (held?.pinned.get(it.id) ?? !it.done);
	function tick(it: CardItem) {
		setDone.mutate({ id: it.id, done: !it.done });
		if (!sorted) return setPopped(it.done ? null : it.id);
		// Unticked: it goes to the end of the open ones, so it leaves the dragged order.
		if (it.done && order.includes(keyOf(it.title))) onReorder(order.filter((k) => k !== keyOf(it.title)));
		setHeld((h) => ({
			order: h?.order ?? new Map(shownIds.map((id, i) => [id, i])),
			pinned: new Map(h?.pinned).set(it.id, h?.pinned.get(it.id) ?? !it.done),
		}));
		tapped.current.add(it.id);
		clearTimeout(wait.current);
		wait.current = setTimeout(
			() => {
				slideRows(card.current, tapped.current, () => setHeld(null));
				tapped.current = new Set();
			},
			it.done ? WAIT_UNTICKED : WAIT_TICKED,
		);
	}
	// While tapped items wait, the order at the first tap.
	const asHeld = (items: CardItem[]) =>
		held ? [...items].sort((a, b) => (held.order.get(a.id) ?? 1e9) - (held.order.get(b.id) ?? 1e9)) : items;
	/** A new name (and icon) for an item; it keeps its place in the dragged order. */
	function renameItem(it: CardItem, title: string) {
		rename.mutate({ id: it.id, title });
		const [from, to] = [keyOf(it.title), keyOf(title)];
		if (from !== to && order.includes(from)) onReorder(order.map((k) => (k === from ? to : k)));
	}
	// Items in the dragged order (new ones at the end, as Reminders has them); sorting unchecked first, the
	// open ones that way and the done ones after.
	const rank = (title: string) => {
		const i = order.indexOf(keyOf(title));
		return i < 0 ? order.length : i;
	};
	const open = asHeld(
		list.items
			.filter(isOpen)
			.map((it, i) => ({ it, i }))
			.sort((a, b) => rank(a.it.title) - rank(b.it.title) || a.i - b.i)
			.map(({ it }) => it),
	);
	// Items under no section first, then a section for each recipe they were added for, in the order
	// they were added; each folds away on this device. Sorting unchecked first, done ones are all together
	// at the end.
	const loose = open.filter((it) => !it.section);
	const sections = [...new Set(list.items.filter((it) => isOpen(it) && it.section).map((it) => it.section!))].map(
		(name) => ({ name, items: open.filter((it) => it.section === name) }),
	);
	const folds = useFolded(`sprig:list-sections-folded:${list.id}`);
	// The whole list folded to its name and how many are left, on this device.
	const listFolds = useFolded('sprig:lists-folded');
	const listFolded = listFolds.isFolded(list.id);
	// Dragged within a part: those items take the front of the order, the rest keep theirs.
	const reorder = (part: CardItem[], ids: string[]) => {
		const keys = ids.map((id) => keyOf(part.find((it) => it.id === id)!.title));
		onReorder([...keys, ...order.filter((k) => !keys.includes(k))]);
	};
	const sortable = (part: CardItem[]) => (
		<SortableList
			items={part}
			getId={(it) => it.id}
			onReorder={(ids) => reorder(part, ids)}
			className={s.items}
			draggingClass={s.dragging}
		>
			{(it, handle) => row(it, handle)}
		</SortableList>
	);
	// Done ones in the order they were ticked, the latest at the very bottom (one just ticked here has no time yet).
	const done = asHeld(
		list.items
			.filter((it) => !isOpen(it))
			.map((it, i) => ({ it, i }))
			.sort((a, b) => (a.it.doneAt ?? '~').localeCompare(b.it.doneAt ?? '~') || a.i - b.i)
			.map(({ it }) => it),
	);
	const doneCount = list.items.filter((it) => it.done).length;
	const shown = [...loose, ...sections.flatMap((x) => x.items), ...done];
	const shownIds = shown.map((it) => it.id);
	const [title, setTitle] = useState('');
	// Picking the icon for the item being typed in the add box.
	const [picking, setPicking] = useState(false);
	// The add box's icon: picked, "none", or undefined to use the suggestion for what's typed.
	const [newIcon, setNewIcon] = useState<string | undefined>(undefined);
	const typed = splitIcon(title.trim());
	const addIcon = typed.icon ?? (newIcon === undefined ? suggestIcon(typed.text) : newIcon === 'none' ? null : newIcon);
	const last = list.syncedBy[0];
	// Changes of this device's still on their way: ticks by item, and added items (not given an id yet).
	const saving = new Set(
		useMutationState({
			filters: { mutationKey: LISTS, status: 'pending' },
			select: (m) => (m.state.variables as { id?: unknown } | undefined)?.id,
		}),
	);
	const isSaving = (it: CardItem) => sprig && (saving.has(it.id) || it.id.startsWith('item-'));

	function submit(e: FormEvent) {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		// The icon goes in the name, so it shows in Reminders too.
		add.mutate({ title: addIcon ? `${addIcon} ${typed.text}` : typed.text });
		// It shows in the list straight away, so the box is ready for the next one.
		setTitle('');
		setNewIcon(undefined);
	}

	/** The new item's icon; it takes the place of any icon typed into the box, and None takes it off. */
	function setIcon(icon: string | null) {
		setTitle(typed.text);
		setNewIcon(icon ?? 'none');
		setPicking(false);
	}

	/**
	 * One item: tick circle, then its icon and name (tapping either ticks it too), ✏️ to edit it, and
	 * (open items) a grip to drag it up or down.
	 */
	function row(it: CardItem, handle?: HandleProps) {
		const { icon, text } = splitIcon(it.title);
		// No icon in its name: show a suggested one, lighter; the ✏️ sheet keeps it or picks another.
		const suggested = icon ? null : suggestIcon(text);
		const toggle = () => tick(it);
		return (
			<div
				className={`${s.row} ${it.done ? s.done : ''} ${it.done && (popped === it.id || held?.pinned.has(it.id)) ? s.justTicked : ''}`}
				style={{ '--c': color } as CSSProperties}
				data-row={it.id}
			>
				<button
					className={s.boxButton}
					aria-pressed={it.done}
					aria-label={`${text}: ${it.done ? 'done' : 'not done'}`}
					onClick={toggle}
				>
					<span className={s.box} aria-hidden="true">
						{it.done ? '✓' : ''}
					</span>
				</button>
				<button className={s.item} onClick={toggle} tabIndex={-1}>
					<span className={`${s.iconSpot} ${suggested ? s.suggested : ''}`} aria-hidden="true">
						{icon ?? suggested}
					</span>
					<span className={s.text}>
						{text}
						{/* When it's due and who it's for. */}
						{(it.due || it.memberId) && (
							<span className={s.meta}>
								{it.due && <span className={!it.done && isLate(it.due) ? s.late : ''}>⏰ {dueLabel(it.due)}</span>}
								{it.memberId && <span>{members.find((m) => m.id === it.memberId)?.name}</span>}
							</span>
						)}
					</span>
					{/* Changed here; it reaches Reminders at the next sync, or the server (and the other phones) in a moment. */}
					{(it.pending || isSaving(it)) && (
						<span className={s.pending} title={it.pending ? 'Waiting to sync' : 'Saving…'}>
							↻
						</span>
					)}
					{/* Who ticked it, in their color. */}
					{it.done && it.doneBy && <TickedBy by={it.doneBy} members={members} />}
				</button>
				<IconButton
					size="sm"
					className={s.edit}
					icon={<PencilIcon />}
					label={`Edit ${text}`}
					title={sprig ? 'Name, icon, when, who, or delete' : 'Name or icon'}
					onClick={() => setDetails(it)}
				/>
				{handle && parent && (
					<span className={s.grip} {...handle}>
						<GripIcon />
					</span>
				)}
			</div>
		);
	}

	return (
		<section className={`${s.card} ${listFolded ? s.cardFolded : ''}`} ref={card}>
			{/* A tap anywhere on the header folds or opens the list, but for its other buttons (the dot, ⋯).
			    The name stays a button, so a keyboard or screen reader reaches it; its click lands here too. */}
			<header
				className={s.head}
				onClick={(e) => {
					const hit = (e.target as Element).closest('button, a, input');
					if (hit && !hit.classList.contains(s.titleButton)) return;
					listFolds.fold([list.id], !listFolded);
				}}
			>
				{/* The dot, name and ⋯ stay together; when it last synced goes under them if a long name needs the room. */}
				<div className={s.titleRow}>
					<button
						className={s.colorDot}
						style={{ background: color }}
						aria-expanded={choosingColor}
						disabled={!parent}
						onClick={() => setChoosingColor(!choosingColor)}
						aria-label={`Color for ${list.title}`}
						title="Change the color"
					/>
					<h2 className={s.title}>
						<button
							className={s.titleButton}
							aria-expanded={!listFolded}
							title={listFolded ? `Open ${list.title}` : `Fold ${list.title}`}
						>
							{list.title}
							{listFolded && <span className={s.titleCount}>{open.length}</span>}
						</button>
					</h2>
					{sprig && parent && (
						<IconButton
							icon="⋯"
							label={`Change ${list.title}`}
							title="Rename or delete"
							onClick={() => setSettingUp(true)}
						/>
					)}
				</div>
				{last && (
					<span className={s.synced} title={list.syncedBy.map((d) => `${d.device}: ${ago(d.at)}`).join('\n')}>
						{last.device} · {ago(last.at)}
					</span>
				)}
			</header>
			{!listFolded && (
				<>
					{/* Under the name, and folded away with the list. */}
					{sprig && (
						<div className={s.shopping}>
							<ShoppingButton shopping={list.shopping} me={me} members={members} onChange={onShopping} />
						</div>
					)}
					{choosingColor && (
						<div className={s.swatches} role="radiogroup" aria-label={`Color for ${list.title}`}>
							{LIST_COLORS.map((c) => (
								<button
									key={c}
									role="radio"
									aria-checked={c === color}
									className={`${s.swatch} ${c === color ? s.swatchOn : ''}`}
									style={{ background: c }}
									onClick={() => {
										onColor(c);
										setChoosingColor(false);
									}}
									aria-label={c}
								/>
							))}
						</div>
					)}
					{/* Items under no recipe (none when every item came from one: no empty list, no extra gap). */}
					{loose.length > 0 && sortable(loose)}
					{sections.map(({ name, items }) => {
						const folded = folds.isFolded(name);
						return (
							<div key={name} className={s.section}>
								<button className={s.sectionHead} aria-expanded={!folded} onClick={() => folds.fold([name], !folded)}>
									<span className={s.sectionName}>{name}</span>
									<span className={s.sectionCount}>{items.length}</span>
								</button>
								{!folded && sortable(items)}
							</div>
						);
					})}
					{done.length > 0 && (
						<ul className={s.items}>
							{done.map((it) => (
								<li key={it.id}>{row(it)}</li>
							))}
						</ul>
					)}
					{sprig && doneCount > 0 && (
						<Button variant="link" size="sm" className={s.clearDone} onClick={() => own.clearDone.mutate(list.id)}>
							Clear {doneCount} done
						</Button>
					)}
					{list.items.length === 0 && <p className={s.empty}>Nothing here.</p>}
					<form className={s.add} onSubmit={submit}>
						<button
							type="button"
							className={`${s.iconSpot} ${s.iconAdd} ${newIcon === undefined && !typed.icon && addIcon ? s.suggested : ''} ${!addIcon ? s.noIcon : ''}`}
							onClick={() => setPicking(true)}
							aria-label="Icon for the new item"
							title={addIcon ? 'Change the icon' : 'Add an icon'}
						>
							{addIcon ?? '+'}
						</button>
						<Input
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder={`Add to ${list.title}`}
							maxLength={300}
							aria-label={`Add to ${list.title}`}
						/>
						<button type="submit" disabled={!title.trim() || add.isPending}>
							Add
						</button>
					</form>
					{problem && <p className={s.error}>Couldn't save: {problem.message}</p>}
				</>
			)}
			{details && (
				<ItemSheet
					item={details}
					members={members}
					sprig={sprig}
					onRename={(title) => renameItem(details, title)}
					onClose={() => setDetails(null)}
				/>
			)}
			{settingUp && (
				<ListSheet
					list={list}
					// Sorting turned off: the list keeps the order it shows now (unchecked first), as its dragged order.
					onUnsort={() => onReorder([...new Set(shown.map((it) => keyOf(it.title)))])}
					onClose={() => setSettingUp(false)}
				/>
			)}
			{picking && (
				<>
					<Sheet label="Pick an icon" onClose={() => setPicking(false)}>
						<header className={sheet.head}>
							<h2 className={sheet.heading}>Icon for {typed.text || 'the new item'}</h2>
							<IconButton label="Close" icon="×" className={sheet.close} onClick={() => setPicking(false)} />
						</header>
						<IconPicker value={addIcon} onChange={setIcon} featured={iconChoices(typed.text)} />
						{!sprig && <p className={s.pickNote}>{REMINDERS_ICON_NOTE}</p>}
					</Sheet>
				</>
			)}
		</section>
	);
}
