import { useState, type CSSProperties, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useMutationState } from '@tanstack/react-query';
import {
	LISTS,
	useAuthStatus,
	useChangeReminders,
	useListActions,
	useLists,
	useLiveLists,
	useMembers,
	useReminders,
	useSetSetting,
	useSettings,
} from '../../lib/queries';
import type { Member, ReminderList } from '../../lib/types';
import { dayKey, hhmm, timeLabel, toInstant } from '../../lib/dates';
import { dueLabel, isDay, isLate } from '../../lib/lists';
import { PickChip } from '../ui/NameChip';
import DateInput from '../ui/DateInput';
import { GROCERY_ICONS, splitIcon, suggestIcon } from '../../lib/emoji';
import IconPicker from '../ui/IconPicker';
import SortableList, { type HandleProps } from '../ui/SortableList';
import { GripIcon, PencilIcon } from '../ui/icons';
import sheet from '../ui/Sheet.module.css';
import { ago } from '../../lib/dates';
import { Loading, Skeleton } from '../ui/Skeleton';
import Problem, { loadProblem } from '../ui/Problem';
import s from './ListView.module.css';
import { useParent } from '../../lib/useParent';
import { textOn } from '../../lib/color';
import Sheet from '../ui/Sheet';
import { ShoppingButton, TickedBy } from '../ui/ShoppingTogether';
import { useFolded } from '../../lib/useFolded';

/** Soft colors for a list's rows, light enough for dark text. */
const LIST_COLORS = ['#f2dcb3', '#ecb0ea', '#c9dcf7', '#cdebd3', '#ddd3f5', '#f8cfb8', '#f6e7a1', '#c3ece4', '#e4e4e4'];

/** An item's place in the saved order: its name without the icon, ignoring case. */
const keyOf = (title: string) => splitIcon(title).text.trim().toLowerCase();

/** The icons offered first for an item: the one its name suggests, then groceries. */
const iconChoices = (text: string) => [
	...new Set([suggestIcon(text), ...GROCERY_ICONS].filter((x): x is string => !!x)),
];

const REMINDERS_ICON_NOTE = 'The icon is added to the start of its name in Reminders, so it shows on your phones too.';

/** A set without one id, for a state update. */
const without = (id: string) => (ids: Set<string>) => {
	const next = new Set(ids);
	next.delete(id);
	return next;
};

/** Each row's name for the slide, so it glides to its new place (CSS names: letters, digits, - and _). */
const slideName = (id: string) => `list-item-${id.replace(/[^\w-]/g, '_')}`;

/** Moves rows to their new places with a slide where the browser can, and straight away where it can't. */
function slide(change: () => void) {
	if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return change();
	document.startViewTransition(() => flushSync(change));
}

/**
 * A list on the page: one of Sprig's own (server/lists.ts), or an iCloud Reminders list synced by
 * the Shortcut. Both show the same; Sprig's items can also say when and who.
 */
interface CardList {
	source: 'sprig' | 'reminders';
	/** Sprig: the list's id. Reminders: its name. */
	id: string;
	title: string;
	items: CardItem[];
	syncedBy: ReminderList['syncedBy'];
	/** Sprig's: who's shopping from it together now (null: a device with no one signed in). */
	shopping: (string | null)[];
}
interface CardItem {
	id: string;
	title: string;
	done: boolean;
	due: string | null;
	/** Reminders: changed here and waiting for a phone. */
	pending?: boolean;
	memberId?: string | null;
	/** Sprig's: who ticked it. */
	doneBy?: string | null;
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

function ListCard({ list, members, me, onShopping, color, onColor, order, onReorder }: CardProps) {
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
	// Just ticked: stays in its place a moment, so it's seen to tick, then slides down to the done ones.
	const [held, setHeld] = useState<Set<string>>(new Set());
	// Unticked while the list is open: stays where it was, down with the done ones, until the list opens again.
	const [kept, setKept] = useState<Set<string>>(new Set());
	const isOpen = (it: CardItem) => (!it.done || held.has(it.id)) && !kept.has(it.id);
	function tick(it: CardItem) {
		setDone.mutate({ id: it.id, done: !it.done });
		if (held.has(it.id)) return setHeld(without(it.id));
		if (kept.has(it.id)) return setKept(without(it.id));
		if (it.done) return setKept((ids) => new Set(ids).add(it.id));
		setHeld((ids) => new Set(ids).add(it.id));
		setTimeout(() => slide(() => setHeld(without(it.id))), 600);
	}
	/** A new name (and icon) for an item; it keeps its place in the dragged order. */
	function renameItem(it: CardItem, title: string) {
		rename.mutate({ id: it.id, title });
		const [from, to] = [keyOf(it.title), keyOf(title)];
		if (from !== to && order.includes(from)) onReorder(order.map((k) => (k === from ? to : k)));
	}
	// Open items in the dragged order (new ones at the end, as Reminders has them); done ones after.
	const rank = (title: string) => {
		const i = order.indexOf(keyOf(title));
		return i < 0 ? order.length : i;
	};
	const open = list.items
		.filter(isOpen)
		.map((it, i) => ({ it, i }))
		.sort((a, b) => rank(a.it.title) - rank(b.it.title) || a.i - b.i)
		.map(({ it }) => it);
	// Open items under no section first, then a section for each recipe they were added for, in the
	// order they were added; each folds away on this device. Done ones are all together at the end.
	const loose = open.filter((it) => !it.section);
	const sections = [...new Set(list.items.filter((it) => isOpen(it) && it.section).map((it) => it.section!))].map(
		(name) => ({ name, items: open.filter((it) => it.section === name) }),
	);
	const folds = useFolded(`sprig:list-sections-folded:${list.id}`);
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
	const done = list.items.filter((it) => !isOpen(it));
	const doneCount = list.items.filter((it) => it.done).length;
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
				className={`${s.row} ${it.done ? s.done : ''} ${held.has(it.id) ? s.justTicked : ''}`}
				style={{ '--c': color, viewTransitionName: slideName(it.id) } as CSSProperties}
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
				<button
					className={`${s.more} ${s.edit}`}
					onClick={() => setDetails(it)}
					aria-label={`Edit ${text}`}
					title={sprig ? 'Name, icon, when, who, or delete' : 'Name or icon'}
				>
					<PencilIcon />
				</button>
				{handle && parent && (
					<span className={s.grip} {...handle}>
						<GripIcon />
					</span>
				)}
			</div>
		);
	}

	return (
		<section className={s.card}>
			<header className={s.head}>
				<button
					className={s.colorDot}
					style={{ background: color }}
					aria-expanded={choosingColor}
					disabled={!parent}
					onClick={() => setChoosingColor(!choosingColor)}
					aria-label={`Color for ${list.title}`}
					title="Change the color"
				/>
				<h2 className={s.title}>{list.title}</h2>
				{sprig && parent && (
					<button
						className={s.more}
						onClick={() => setSettingUp(true)}
						aria-label={`Change ${list.title}`}
						title="Rename or delete"
					>
						⋯
					</button>
				)}
				{sprig && <ShoppingButton shopping={list.shopping} me={me} members={members} onChange={onShopping} />}
				{last && (
					<span className={s.synced} title={list.syncedBy.map((d) => `${d.device}: ${ago(d.at)}`).join('\n')}>
						{last.device} · {ago(last.at)}
					</span>
				)}
			</header>
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
			{sortable(loose)}
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
				<button className={s.clearDone} onClick={() => own.clearDone.mutate(list.id)}>
					Clear {doneCount} done
				</button>
			)}
			{list.items.length === 0 && <p className={s.empty}>Nothing here.</p>}
			<form className={s.add} onSubmit={submit} style={{ '--c': color, '--on': textOn(color) } as CSSProperties}>
				<button
					type="button"
					className={`${s.iconSpot} ${s.iconAdd} ${newIcon === undefined && !typed.icon && addIcon ? s.suggested : ''} ${!addIcon ? s.noIcon : ''}`}
					onClick={() => setPicking(true)}
					aria-label="Icon for the new item"
					title={addIcon ? 'Change the icon' : 'Add an icon'}
				>
					{addIcon ?? '+'}
				</button>
				<input
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
			{details && (
				<ItemSheet
					item={details}
					members={members}
					sprig={sprig}
					onRename={(title) => renameItem(details, title)}
					onClose={() => setDetails(null)}
				/>
			)}
			{settingUp && <ListSheet list={list} onClose={() => setSettingUp(false)} />}
			{picking && (
				<>
					<Sheet label="Pick an icon" onClose={() => setPicking(false)}>
						<header className={sheet.head}>
							<h2 className={sheet.heading}>Icon for {typed.text || 'the new item'}</h2>
							<button className={sheet.close} onClick={() => setPicking(false)} aria-label="Close">
								×
							</button>
						</header>
						<IconPicker value={addIcon} onChange={setIcon} featured={iconChoices(typed.text)} />
						{!sprig && <p className={s.pickNote}>{REMINDERS_ICON_NOTE}</p>}
					</Sheet>
				</>
			)}
		</section>
	);
}

/** The Lists page: Sprig's own lists, and shared iCloud Reminders lists synced through the phones. */
export default function ListView() {
	// Choosing which lists show needs a parent.
	const { parent } = useParent();
	// Lists hidden from the wall, by name (lowercase, so a renamed capital doesn't bring one back).
	const hidden = (useSettings().data?.hiddenLists as string[] | undefined) ?? [];
	const setSetting = useSetSetting();
	const ownQuery = useLists();
	const lists = [...(ownQuery.data ?? []), ...(useReminders().data?.lists ?? [])];
	const [choosing, setChoosing] = useState(false);
	const [adding, setAdding] = useState(false);
	const isHidden = (title: string) => hidden.includes(title.toLowerCase());
	const toggle = (title: string) => {
		const key = title.toLowerCase();
		setSetting.mutate({
			key: 'hiddenLists',
			value: isHidden(title) ? hidden.filter((h) => h !== key) : [...hidden, key],
		});
	};

	return (
		<section className={s.page} aria-label="Lists">
			<header className={s.pageHead}>
				<h1 className={s.pageTitle}>Lists</h1>
				<span className={s.spacer} />
				{parent && (
					<button className={s.choose} onClick={() => setAdding(true)}>
						+ New list
					</button>
				)}
				{lists.length > 0 && parent && (
					<button className={s.choose} aria-pressed={choosing} onClick={() => setChoosing(!choosing)}>
						{choosing ? 'Done' : 'Choose lists'}
					</button>
				)}
			</header>
			{choosing && (
				<div className={s.picker} role="group" aria-label="Lists to show">
					{lists.map((l) => (
						<button key={l.title} className={s.pick} aria-pressed={!isHidden(l.title)} onClick={() => toggle(l.title)}>
							<span className={s.box} aria-hidden="true">
								{isHidden(l.title) ? '' : '✓'}
							</span>
							{l.title}
						</button>
					))}
				</div>
			)}
			{/* Couldn't check with the family's phones since: said, so two people shopping don't both buy it. */}
			{ownQuery.data && (ownQuery.fetchStatus === 'paused' || ownQuery.errorUpdatedAt > ownQuery.dataUpdatedAt) && (
				<p className={s.unsynced} role="status">
					📶 Not synced since {timeLabel(new Date(ownQuery.dataUpdatedAt))}: ticks from other phones won’t show until
					the signal’s back.
				</p>
			)}
			{/* Loading: list-shaped blocks, not "no lists yet". A failed refresh keeps what's there (above). */}
			{ownQuery.isError && !ownQuery.data ? (
				<Problem kind="page" message={loadProblem('lists', ownQuery.error)} onRetry={() => void ownQuery.refetch()} />
			) : ownQuery.isPending ? (
				<Loading label="Loading lists" className={s.loading}>
					<Skeleton height="14rem" />
					<Skeleton height="14rem" />
				</Loading>
			) : (
				<Lists hidden={isHidden} onNew={parent ? () => setAdding(true) : undefined} />
			)}
			{adding && <NewListSheet onClose={() => setAdding(false)} />}
		</section>
	);
}

function Lists({ hidden, onNew }: { hidden: (title: string) => boolean; onNew?: () => void }) {
	const reminders = useReminders();
	const own = useLists();
	const members = useMembers().data ?? [];
	const auth = useAuthStatus().data;
	const me = auth?.signedIn ? auth.memberId : null;
	const { shopping } = useListActions();
	// Shopping together from any list here: the lists come live while this page is open. It stays on
	// for two hours (server/lists.ts) or until it's tapped off, so a look at a recipe and back finds it on.
	useLiveLists((own.data ?? []).some((l) => l.shopping.includes(me)));
	// Each list's color and its items' dragged order, kept on the wall by list name.
	const settings = useSettings().data;
	const colors = (settings?.listColors as Record<string, string> | undefined) ?? {};
	const orders = (settings?.listOrder as Record<string, string[]> | undefined) ?? {};
	const setSetting = useSetSetting();
	if (reminders.isPending || own.isPending) return null;
	const all: CardList[] = [
		...(own.data ?? []).map((l) => ({ ...l, source: 'sprig' as const, syncedBy: [] })),
		...(reminders.data?.lists ?? []).map((l) => ({ ...l, id: l.title, source: 'reminders' as const, shopping: [] })),
	];
	if (all.length === 0) {
		return (
			<div className={s.setup}>
				<h2>No lists yet</h2>
				<p>Make one for groceries, to-dos or packing. Anyone can add to it and tick things off.</p>
				{onNew && (
					<button className={s.choose} onClick={onNew}>
						+ New list
					</button>
				)}
				{reminders.data?.enabled && (
					<p>Your iCloud Reminders lists show up here too, after the Reminders Shortcut runs on an iPhone.</p>
				)}
			</div>
		);
	}
	const shown = all.filter((l) => !hidden(l.title));
	if (shown.length === 0) {
		return (
			<div className={s.setup}>
				<h2>All lists are hidden</h2>
				<p>
					Tap <strong>Choose lists</strong> to pick which ones show here.
				</p>
			</div>
		);
	}
	return (
		<div className={s.board}>
			{shown.map((l) => (
				<ListCard
					key={`${l.source}:${l.id}`}
					list={l}
					members={members}
					me={me}
					onShopping={(on) => shopping.mutate({ id: l.id, on })}
					// Until one is picked, each list gets the next color in turn.
					color={colors[l.title.toLowerCase()] ?? LIST_COLORS[all.indexOf(l) % LIST_COLORS.length]}
					onColor={(c) => setSetting.mutate({ key: 'listColors', value: { ...colors, [l.title.toLowerCase()]: c } })}
					order={orders[l.title.toLowerCase()] ?? []}
					onReorder={(order) =>
						setSetting.mutate({ key: 'listOrder', value: { ...orders, [l.title.toLowerCase()]: order } })
					}
				/>
			))}
		</div>
	);
}

/** Starting a new list of Sprig's own. */
function NewListSheet({ onClose }: { onClose: () => void }) {
	const { addList } = useListActions();
	const [title, setTitle] = useState('');
	return (
		<>
			<Sheet
				label="New list"
				onClose={onClose}
				className={sheet.confirm}
				onSubmit={(e) => {
					e.preventDefault();
					if (title.trim()) addList.mutate(title, { onSuccess: onClose });
				}}
			>
				<h2 className={sheet.heading}>New list</h2>
				<input
					className={s.nameInput}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="Groceries, To do, Packing…"
					maxLength={100}
					autoFocus
					aria-label="List name"
				/>
				{addList.isError && <p className={s.error}>{addList.error.message}</p>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className={sheet.primary} disabled={!title.trim() || addList.isPending}>
						Make it
					</button>
				</div>
			</Sheet>
		</>
	);
}

/**
 * Add to a list from anywhere (the phone's +): type it, pick the list, Add. It stays open for the next
 * one, so a few groceries go in one after another.
 */
export function AddToListSheet({
	onClose,
	onNewList,
}: {
	onClose: () => void;
	/** No lists yet: go make one. */ onNewList: () => void;
}) {
	const lists = useLists().data;
	const { add } = useListActions();
	const [title, setTitle] = useState('');
	const [listId, setListId] = useState<string | null>(null);
	const [added, setAdded] = useState<string | null>(null);
	const chosen = lists?.find((l) => l.id === listId) ?? lists?.[0];
	return (
		<>
			<Sheet
				label="Add to a list"
				onClose={onClose}
				className={sheet.confirm}
				onSubmit={(e) => {
					e.preventDefault();
					if (!chosen || !title.trim()) return;
					add.mutate({ listId: chosen.id, title: title.trim() });
					setAdded(`${title.trim()} → ${chosen.title}`);
					setTitle('');
				}}
			>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>Add to a list</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
						×
					</button>
				</header>
				{lists && lists.length === 0 ? (
					<>
						<p className={sheet.body}>No lists yet. Make one on the Lists page first: Groceries, To do, Packing…</p>
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<button type="button" className={sheet.primary} onClick={onNewList}>
								Go to Lists
							</button>
						</div>
					</>
				) : (
					<>
						<input
							className={s.nameInput}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Milk, call the dentist…"
							maxLength={300}
							autoFocus
							aria-label="What to add"
						/>
						<div className={s.listPicks} role="radiogroup" aria-label="Which list">
							{lists?.map((l) => (
								<button
									key={l.id}
									type="button"
									role="radio"
									aria-checked={l.id === chosen?.id}
									className={`${s.listPick} ${l.id === chosen?.id ? s.listPicked : ''}`}
									onClick={() => setListId(l.id)}
								>
									{l.title}
								</button>
							))}
						</div>
						{added && <p className={s.added}>✓ {added}</p>}
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<button type="button" className={sheet.secondary} onClick={onClose}>
								Done
							</button>
							<button type="submit" className={sheet.primary} disabled={!title.trim() || !chosen}>
								Add
							</button>
						</div>
					</>
				)}
			</Sheet>
		</>
	);
}

/** A list of Sprig's own: rename it, or delete it with everything on it. */
function ListSheet({ list, onClose }: { list: CardList; onClose: () => void }) {
	const { renameList, deleteList } = useListActions();
	const [title, setTitle] = useState(list.title);
	const [deleting, setDeleting] = useState(false);
	return (
		<>
			<Sheet
				label={`Change ${list.title}`}
				onClose={onClose}
				className={sheet.confirm}
				onSubmit={(e) => {
					e.preventDefault();
					if (title.trim() && title.trim() !== list.title)
						renameList.mutate({ id: list.id, title }, { onSuccess: onClose });
					else onClose();
				}}
			>
				<h2 className={sheet.heading}>{list.title}</h2>
				<input
					className={s.nameInput}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					maxLength={100}
					aria-label="List name"
				/>
				{(renameList.error ?? deleteList.error) && (
					<p className={s.error}>{(renameList.error ?? deleteList.error)!.message}</p>
				)}
				<div className={sheet.actions}>
					<button
						type="button"
						className={sheet.danger}
						onClick={() => (deleting ? deleteList.mutate(list.id, { onSuccess: onClose }) : setDeleting(true))}
					>
						{deleting ? `Delete it and its ${list.items.length} items` : 'Delete list'}
					</button>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className={sheet.primary} disabled={!title.trim()}>
						Save
					</button>
				</div>
			</Sheet>
		</>
	);
}

interface ItemSheetProps {
	item: CardItem;
	members: Member[];
	/** One of Sprig's lists: when, who and delete too. Reminders: the name and icon only. */
	sprig: boolean;
	/** A new name, with the icon at its start. */
	onRename: (title: string) => void;
	onClose: () => void;
}

/**
 * Editing an item (its ✏️): the name and icon; on Sprig's lists also when it's due (a day, and a time if
 * it matters) and who it's for, or delete it.
 */
function ItemSheet({ item, members, sprig, onRename, onClose }: ItemSheetProps) {
	const { update, remove } = useListActions();
	const [name, setName] = useState(splitIcon(item.title).text);
	const [icon, setIcon] = useState(splitIcon(item.title).icon);
	const [choosingIcon, setChoosingIcon] = useState(false);
	const [day, setDay] = useState(item.due ? (isDay(item.due) ? item.due : dayKey(new Date(item.due))) : '');
	const [time, setTime] = useState(item.due && !isDay(item.due) ? hhmm(item.due) : '');
	const [who, setWho] = useState(item.memberId ?? null);
	const [deleting, setDeleting] = useState(false);
	function save(e?: FormEvent) {
		e?.preventDefault();
		const text = name.trim();
		const title = !text ? item.title : icon ? `${icon} ${text}` : text;
		if (title !== item.title) onRename(title);
		if (sprig) {
			const due = !day ? null : time ? toInstant(day, time) : day;
			if (due !== item.due || who !== (item.memberId ?? null)) update.mutate({ id: item.id, due, memberId: who });
		}
		onClose();
	}
	return (
		<>
			<Sheet label={`Edit ${name || 'item'}`} onClose={onClose} className={sheet.confirm}>
				<div className={sheet.head}>
					<h2 className={sheet.heading}>Edit item</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">
						×
					</button>
				</div>
				<form className={s.nameRow} onSubmit={save}>
					<button
						type="button"
						className={`${s.iconSpot} ${s.iconAdd} ${!icon ? s.noIcon : ''}`}
						aria-expanded={choosingIcon}
						onClick={() => setChoosingIcon(!choosingIcon)}
						aria-label="Icon"
						title={icon ? 'Change the icon' : 'Add an icon'}
					>
						{icon ?? '+'}
					</button>
					<input value={name} onChange={(e) => setName(e.target.value)} maxLength={300} aria-label="Name" />
				</form>
				{choosingIcon && (
					<IconPicker
						value={icon}
						onChange={(picked) => {
							setIcon(picked);
							setChoosingIcon(false);
						}}
						featured={iconChoices(name)}
					/>
				)}
				{!sprig && <p className={s.pickNote}>{REMINDERS_ICON_NOTE}</p>}
				{sprig && <ItemWhenWho {...{ day, setDay, time, setTime, who, setWho, members }} />}
				<div className={sheet.actions}>
					{sprig && (
						<button
							type="button"
							className={sheet.danger}
							onClick={() => (deleting ? remove.mutate(item.id, { onSuccess: onClose }) : setDeleting(true))}
						>
							{deleting ? 'Tap again to delete' : 'Delete'}
						</button>
					)}
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>
						Cancel
					</button>
					<button type="button" className={sheet.primary} onClick={() => save()}>
						Save
					</button>
				</div>
			</Sheet>
		</>
	);
}

/** When a Sprig list item is due and who it's for, in its edit sheet. */
function ItemWhenWho({
	day,
	setDay,
	time,
	setTime,
	who,
	setWho,
	members,
}: {
	day: string;
	setDay: (day: string) => void;
	time: string;
	setTime: (time: string) => void;
	who: string | null;
	setWho: (who: string | null) => void;
	members: Member[];
}) {
	return (
		<>
			<div className={s.whenRow}>
				<label>
					Day
					<DateInput value={day} onChange={(e) => setDay(e.target.value)} />
				</label>
				<label>
					Time (optional)
					<input type="time" step={300} value={time} disabled={!day} onChange={(e) => setTime(e.target.value)} />
				</label>
				{day && (
					<button
						type="button"
						className={s.clearDone}
						onClick={() => {
							setDay('');
							setTime('');
						}}
					>
						No date
					</button>
				)}
			</div>
			<p className={s.pickNote}>With a day, it shows under Needs you on Today when it's due.</p>
			<div className={s.pickNote}>Who it's for</div>
			<div className={s.whoRow}>
				{members.map((m) => (
					<PickChip
						key={m.id}
						name={m.name}
						color={m.color}
						on={who === m.id}
						onClick={() => setWho(who === m.id ? null : m.id)}
					/>
				))}
			</div>
		</>
	);
}
