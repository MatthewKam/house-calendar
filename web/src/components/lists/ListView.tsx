import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
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
import { dueLabel, isDay, isLate, LIST_COLORS, listColor } from '../../lib/lists';
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
import Sheet from '../ui/Sheet';
import Switch from '../ui/Switch';
import { ShoppingButton, TickedBy } from '../ui/ShoppingTogether';
import { useFolded } from '../../lib/useFolded';
import { Button, IconButton } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Field, Fieldset, Input } from '../ui/Field';
import { List, ListRow } from '../ui/ListRow';

/** Soft colors for a list's rows, light enough for dark text. */

/** An item's place in the saved order: its name without the icon, ignoring case. */
const keyOf = (title: string) => splitIcon(title).text.trim().toLowerCase();

/** The icons offered first for an item: the one its name suggests, then groceries. */
const iconChoices = (text: string) => [
	...new Set([suggestIcon(text), ...GROCERY_ICONS].filter((x): x is string => !!x)),
];

const REMINDERS_ICON_NOTE = 'The icon is added to the start of its name in Reminders, so it shows on your phones too.';

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
interface CardList {
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
interface CardItem {
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
				<h2 className={s.title}>
					<button
						className={s.titleButton}
						aria-expanded={!listFolded}
						title={listFolded ? `Open ${list.title}` : `Fold ${list.title}`}
						onClick={() => listFolds.fold([list.id], !listFolded)}
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
				{sprig && <ShoppingButton shopping={list.shopping} me={me} members={members} onChange={onShopping} />}
				{last && (
					<span className={s.synced} title={list.syncedBy.map((d) => `${d.device}: ${ago(d.at)}`).join('\n')}>
						{last.device} · {ago(last.at)}
					</span>
				)}
			</header>
			{!listFolded && (
				<>
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
					<Button icon="+" onClick={() => setAdding(true)}>
						New list
					</Button>
				)}
				{lists.length > 0 && parent && (
					<Button
						variant={choosing ? 'primary' : 'secondary'}
						aria-pressed={choosing}
						onClick={() => setChoosing(!choosing)}
					>
						{choosing ? 'Done' : 'Choose lists'}
					</Button>
				)}
			</header>
			{choosing && (
				<div className={s.picker} role="group" aria-label="Lists to show">
					{lists.map((l) => (
						<Chip
							key={l.title}
							icon={isHidden(l.title) ? undefined : '✓'}
							pressed={!isHidden(l.title)}
							onClick={() => toggle(l.title)}
						>
							{l.title}
						</Chip>
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
					<Button variant="primary" icon="+" onClick={onNew}>
						New list
					</Button>
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
					color={listColor(l.title, all.indexOf(l), colors)}
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
				<Field label="List name">
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Groceries, To do, Packing…"
						maxLength={100}
						autoFocus
					/>
				</Field>
				{addList.isError && <p className={s.error}>{addList.error.message}</p>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<Button onClick={onClose}>Cancel</Button>
					<Button variant="primary" type="submit" disabled={!title.trim() || addList.isPending}>
						Make it
					</Button>
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
					<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
				</header>
				{lists && lists.length === 0 ? (
					<>
						<p className={sheet.body}>No lists yet. Make one on the Lists page first: Groceries, To do, Packing…</p>
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<Button variant="primary" onClick={onNewList}>
								Go to Lists
							</Button>
						</div>
					</>
				) : (
					<>
						<Field label="What to add">
							<Input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Milk, call the dentist…"
								maxLength={300}
								autoFocus
							/>
						</Field>
						<Fieldset label="Which list">
							{lists?.map((l) => (
								<Chip key={l.id} pressed={l.id === chosen?.id} onClick={() => setListId(l.id)}>
									{l.title}
								</Chip>
							))}
						</Fieldset>
						{added && <p className={s.added}>✓ {added}</p>}
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<Button onClick={onClose}>Done</Button>
							<Button variant="primary" type="submit" disabled={!title.trim() || !chosen}>
								Add
							</Button>
						</div>
					</>
				)}
			</Sheet>
		</>
	);
}

/** A list of Sprig's own: rename it, or delete it with everything on it. */
function ListSheet({ list, onUnsort, onClose }: { list: CardList; onUnsort: () => void; onClose: () => void }) {
	const { changeList, deleteList } = useListActions();
	const [title, setTitle] = useState(list.title);
	const [sort, setSort] = useState(!!list.sortUnchecked);
	const [deleting, setDeleting] = useState(false);
	return (
		<>
			<Sheet
				label={`Change ${list.title}`}
				onClose={onClose}
				className={sheet.confirm}
				onSubmit={(e) => {
					e.preventDefault();
					const renamed = title.trim() && title.trim() !== list.title;
					if (!sort && list.sortUnchecked) onUnsort();
					if (renamed || sort !== !!list.sortUnchecked)
						changeList.mutate(
							{ id: list.id, ...(renamed ? { title } : {}), sortUnchecked: sort },
							{ onSuccess: onClose },
						);
					else onClose();
				}}
			>
				<h2 className={sheet.heading}>{list.title}</h2>
				<Field label="List name">
					<Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
				</Field>
				<List>
					<ListRow
						title="Sort unchecked first"
						detail="Ticked items move to the bottom. Off, they stay in place."
						trailing={<Switch on={sort} onChange={setSort} label="Sort unchecked first" />}
					/>
				</List>
				{(changeList.error ?? deleteList.error) && (
					<p className={s.error}>{(changeList.error ?? deleteList.error)!.message}</p>
				)}
				<div className={sheet.actions}>
					<Button
						variant={deleting ? 'destructive' : 'danger'}
						onClick={() => (deleting ? deleteList.mutate(list.id, { onSuccess: onClose }) : setDeleting(true))}
					>
						{deleting ? `Delete it and its ${list.items.length} items` : 'Delete list'}
					</Button>
					<span className={sheet.spacer} />
					<Button onClick={onClose}>Cancel</Button>
					<Button variant="primary" type="submit" disabled={!title.trim()}>
						Save
					</Button>
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
					<IconButton label="Close" icon="×" className={sheet.close} onClick={onClose} />
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
					<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={300} aria-label="Name" />
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
						<Button
							variant={deleting ? 'destructive' : 'danger'}
							onClick={() => (deleting ? remove.mutate(item.id, { onSuccess: onClose }) : setDeleting(true))}
						>
							{deleting ? 'Tap again to delete' : 'Delete'}
						</Button>
					)}
					<span className={sheet.spacer} />
					<Button onClick={onClose}>Cancel</Button>
					<Button variant="primary" onClick={() => save()}>
						Save
					</Button>
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
				<Field label="Day">
					<DateInput value={day} onChange={(e) => setDay(e.target.value)} />
				</Field>
				<Field label="Time" hint="Optional">
					<Input type="time" step={300} value={time} disabled={!day} onChange={(e) => setTime(e.target.value)} />
				</Field>
				{day && (
					<Button
						variant="link"
						size="sm"
						onClick={() => {
							setDay('');
							setTime('');
						}}
					>
						No date
					</Button>
				)}
			</div>
			<p className={s.pickNote}>With a day, it shows under List items on Today when it's due.</p>
			<Fieldset label="Who it's for">
				{members.map((m) => (
					<PickChip
						key={m.id}
						name={m.name}
						color={m.color}
						on={who === m.id}
						onClick={() => setWho(who === m.id ? null : m.id)}
					/>
				))}
			</Fieldset>
		</>
	);
}
