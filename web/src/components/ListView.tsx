import { useState, type CSSProperties, type FormEvent } from "react";
import {
	useChangeReminders,
	useListActions,
	useLists,
	useMembers,
	useReminders,
	useSetSetting,
	useSettings,
} from "../lib/queries";
import type { Member, ReminderList } from "../lib/types";
import { dayKey, hhmm, toInstant } from "../lib/dates";
import { dueLabel, isDay, isLate } from "../lib/lists";
import { PickChip } from "./NameChip";
import DateInput from "./DateInput";
import { GROCERY_ICONS, splitIcon, suggestIcon } from "../lib/emoji";
import IconPicker from "./IconPicker";
import SortableList, { type HandleProps } from "./SortableList";
import { GripIcon } from "./icons";
import sheet from "../styles/Sheet.module.css";
import { ago } from "../lib/dates";
import s from "../styles/ListView.module.css";
import { useParent } from "../lib/useParent";

/** Soft colors for a list's rows, light enough for dark text. */
const LIST_COLORS = ["#f2dcb3", "#ecb0ea", "#c9dcf7", "#cdebd3", "#ddd3f5", "#f8cfb8", "#f6e7a1", "#c3ece4", "#e4e4e4"];

/** An item's place in the saved order: its name without the icon, ignoring case. */
const keyOf = (title: string) => splitIcon(title).text.trim().toLowerCase();

/**
 * A list on the page: one of Sprig's own (server/lists.ts), or an iCloud Reminders list synced by
 * the Shortcut. Both show the same; Sprig's items can also say when and who.
 */
interface CardList {
	source: "sprig" | "reminders";
	/** Sprig: the list's id. Reminders: its name. */
	id: string;
	title: string;
	items: CardItem[];
	syncedBy: ReminderList["syncedBy"];
}
interface CardItem {
	id: string;
	title: string;
	done: boolean;
	due: string | null;
	/** Reminders: changed here and waiting for a phone. */
	pending?: boolean;
	memberId?: string | null;
}

interface CardProps {
	list: CardList;
	members: Member[];
	color: string;
	onColor: (color: string) => void;
	/** Item names in the order they were dragged into (kept on the wall). */
	order: string[];
	onReorder: (order: string[]) => void;
}

function ListCard({ list, members, color, onColor, order, onReorder }: CardProps) {
	const reminders = useChangeReminders();
	const own = useListActions();
	const sprig = list.source === "sprig";
	// The same three changes either way: to Sprig's list, or queued for Reminders.
	const add = {
		mutate: (v: { title: string }) => (sprig ? own.add.mutate({ listId: list.id, title: v.title }) : reminders.add.mutate({ list: list.title, title: v.title })),
		isPending: sprig ? own.add.isPending : reminders.add.isPending,
	};
	const setDone = { mutate: (v: { id: string; done: boolean }) => (sprig ? own.update.mutate(v) : reminders.setDone.mutate(v)) };
	const rename = { mutate: (v: { id: string; title: string }) => (sprig ? own.update.mutate(v) : reminders.rename.mutate(v)) };
	const problem = sprig
		? (own.add.error ?? own.update.error ?? own.clearDone.error)
		: (reminders.add.error ?? reminders.setDone.error ?? reminders.rename.error);
	// Sprig's lists: an item's when and who, and the list's name, open in a sheet.
	const [details, setDetails] = useState<CardItem | null>(null);
	const [settingUp, setSettingUp] = useState(false);
	// Adding and ticking are anyone's; renaming (icons), colors and order need a parent.
	const { parent } = useParent();
	const [choosingColor, setChoosingColor] = useState(false);
	// Open items in the dragged order (new ones at the end, as Reminders has them); done ones after.
	const rank = (title: string) => {
		const i = order.indexOf(keyOf(title));
		return i < 0 ? order.length : i;
	};
	const open = list.items.filter((it) => !it.done).map((it, i) => ({ it, i }))
		.sort((a, b) => rank(a.it.title) - rank(b.it.title) || a.i - b.i).map(({ it }) => it);
	const done = list.items.filter((it) => it.done);
	const [title, setTitle] = useState("");
	// The item whose icon is being picked; id "new" is the item being typed in the add box.
	const [picking, setPicking] = useState<{ id: string; title: string } | null>(
		null,
	);
	// The add box's icon: picked, "none", or undefined to use the suggestion for what's typed.
	const [newIcon, setNewIcon] = useState<string | undefined>(undefined);
	const typed = splitIcon(title.trim());
	const addIcon =
		typed.icon ??
		(newIcon === undefined
			? suggestIcon(typed.text)
			: newIcon === "none"
				? null
				: newIcon);
	const last = list.syncedBy[0];

	function submit(e: FormEvent) {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		// The icon goes in the name, so it shows in Reminders too.
		add.mutate({ title: addIcon ? `${addIcon} ${typed.text}` : typed.text });
		// It shows in the list straight away, so the box is ready for the next one.
		setTitle("");
		setNewIcon(undefined);
	}

	/** The icon goes at the start of the item's name in Reminders; None takes it off. */
	function setIcon(icon: string | null) {
		if (!picking) return;
		if (picking.id === "new") {
			// Takes the place of any icon typed into the box.
			setTitle(typed.text);
			setNewIcon(icon ?? "none");
			setPicking(null);
			return;
		}
		const { text } = splitIcon(picking.title);
		const next = icon ? `${icon} ${text}` : text;
		if (next !== picking.title) rename.mutate({ id: picking.id, title: next });
		setPicking(null);
	}

	/** One item: tick circle, icon, name, and (open items) a grip to drag it up or down. */
	function row(it: CardItem, handle?: HandleProps) {
		const { icon, text } = splitIcon(it.title);
		// No icon in its name: show a suggested one, lighter, until it's picked.
		const suggested = icon ? null : suggestIcon(text);
		const toggle = () => setDone.mutate({ id: it.id, done: !it.done });
		return (
			<div className={`${s.row} ${it.done ? s.done : ""}`} style={{ "--c": color } as CSSProperties}>
				<button className={s.boxButton} aria-pressed={it.done} aria-label={`${text}: ${it.done ? "done" : "not done"}`} onClick={toggle}>
					<span className={s.box} aria-hidden="true">
						{it.done ? "✓" : ""}
					</span>
				</button>
				<button
					className={`${s.iconSpot} ${suggested ? s.suggested : ""} ${!icon && !suggested ? s.noIcon : ""}`}
					disabled={!parent}
					onClick={() => setPicking({ id: it.id, title: it.title })}
					aria-label={`Icon for ${text}`}
					title={icon ? "Change icon" : suggested ? "Suggested icon: tap to keep or change" : "Add an icon"}
				>
					{icon ?? suggested ?? "+"}
				</button>
				<button className={s.item} onClick={toggle} tabIndex={-1}>
					<span className={s.text}>
						{text}
						{/* When it's due and who it's for. */}
						{(it.due || it.memberId) && (
							<span className={s.meta}>
								{it.due && <span className={!it.done && isLate(it.due) ? s.late : ""}>⏰ {dueLabel(it.due)}</span>}
								{it.memberId && <span>{members.find((m) => m.id === it.memberId)?.name}</span>}
							</span>
						)}
					</span>
					{/* Changed here; it reaches Reminders at the next sync. */}
					{it.pending && (
						<span className={s.pending} title="Waiting to sync">
							↻
						</span>
					)}
				</button>
				{sprig && parent && (
					<button className={s.more} onClick={() => setDetails(it)} aria-label={`When and who for ${text}`} title="When, who, or delete">
						⋯
					</button>
				)}
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
				<button className={s.colorDot} style={{ background: color }} aria-expanded={choosingColor} disabled={!parent}
					onClick={() => setChoosingColor(!choosingColor)} aria-label={`Color for ${list.title}`} title="Change the color" />
				<h2 className={s.title}>{list.title}</h2>
				{sprig && parent && (
					<button className={s.more} onClick={() => setSettingUp(true)} aria-label={`Change ${list.title}`} title="Rename or delete">
						⋯
					</button>
				)}
				{last && (
					<span
						className={s.synced}
						title={list.syncedBy
							.map((d) => `${d.device}: ${ago(d.at)}`)
							.join("\n")}
					>
						{last.device} · {ago(last.at)}
					</span>
				)}
			</header>
			{choosingColor && (
				<div className={s.swatches} role="radiogroup" aria-label={`Color for ${list.title}`}>
					{LIST_COLORS.map((c) => (
						<button key={c} role="radio" aria-checked={c === color} className={`${s.swatch} ${c === color ? s.swatchOn : ""}`}
							style={{ background: c }} onClick={() => {
								onColor(c);
								setChoosingColor(false);
							}} aria-label={c} />
					))}
				</div>
			)}
			<SortableList
				items={open}
				getId={(it) => it.id}
				onReorder={(ids) => onReorder(ids.map((id) => keyOf(open.find((it) => it.id === id)!.title)))}
				className={s.items}
				draggingClass={s.dragging}
			>
				{(it, handle) => row(it, handle)}
			</SortableList>
			{done.length > 0 && <ul className={s.items}>{done.map((it) => <li key={it.id}>{row(it)}</li>)}</ul>}
			{sprig && done.length > 0 && (
				<button className={s.clearDone} onClick={() => own.clearDone.mutate(list.id)}>
					Clear {done.length} done
				</button>
			)}
			{list.items.length === 0 && <p className={s.empty}>Nothing here.</p>}
			<form className={s.add} onSubmit={submit} style={{ "--c": color } as CSSProperties}>
				<button
					type="button"
					className={`${s.iconSpot} ${s.iconAdd} ${newIcon === undefined && !typed.icon && addIcon ? s.suggested : ""} ${!addIcon ? s.noIcon : ""}`}
					onClick={() =>
						setPicking({
							id: "new",
							title: addIcon ? `${addIcon} ${typed.text}` : typed.text,
						})
					}
					aria-label="Icon for the new item"
					title={addIcon ? "Change the icon" : "Add an icon"}
				>
					{addIcon ?? "+"}
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
			{details && <ItemSheet item={details} members={members} onClose={() => setDetails(null)} />}
			{settingUp && <ListSheet list={list} onClose={() => setSettingUp(false)} />}
			{picking && (
				<>
					<div
						className={sheet.scrim}
						onClick={() => setPicking(null)}
						role="presentation"
					/>
					<div className={sheet.sheet} role="dialog" aria-label="Pick an icon">
						<header className={sheet.head}>
							<h2 className={sheet.heading}>
								Icon for {splitIcon(picking.title).text || "the new item"}
							</h2>
							<button
								className={sheet.close}
								onClick={() => setPicking(null)}
								aria-label="Close"
							>
								×
							</button>
						</header>
						<IconPicker
							value={splitIcon(picking.title).icon}
							onChange={setIcon}
							featured={[
								...new Set(
									[
										suggestIcon(splitIcon(picking.title).text),
										...GROCERY_ICONS,
									].filter((x): x is string => !!x),
								),
							]}
						/>
						{!sprig && (
							<p className={s.pickNote}>
								The icon is added to the start of its name in Reminders, so it
								shows on your phones too.
							</p>
						)}
					</div>
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
	const hidden =
		(useSettings().data?.hiddenLists as string[] | undefined) ?? [];
	const setSetting = useSetSetting();
	const lists = [...(useLists().data ?? []), ...(useReminders().data?.lists ?? [])];
	const [choosing, setChoosing] = useState(false);
	const [adding, setAdding] = useState(false);
	const isHidden = (title: string) => hidden.includes(title.toLowerCase());
	const toggle = (title: string) => {
		const key = title.toLowerCase();
		setSetting.mutate({
			key: "hiddenLists",
			value: isHidden(title)
				? hidden.filter((h) => h !== key)
				: [...hidden, key],
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
					<button
						className={s.choose}
						aria-pressed={choosing}
						onClick={() => setChoosing(!choosing)}
					>
						{choosing ? "Done" : "Choose lists"}
					</button>
				)}
			</header>
			{choosing && (
				<div className={s.picker} role="group" aria-label="Lists to show">
					{lists.map((l) => (
						<button
							key={l.title}
							className={s.pick}
							aria-pressed={!isHidden(l.title)}
							onClick={() => toggle(l.title)}
						>
							<span className={s.box} aria-hidden="true">
								{isHidden(l.title) ? "" : "✓"}
							</span>
							{l.title}
						</button>
					))}
				</div>
			)}
			<Lists hidden={isHidden} onNew={parent ? () => setAdding(true) : undefined} />
			{adding && <NewListSheet onClose={() => setAdding(false)} />}
		</section>
	);
}

function Lists({ hidden, onNew }: { hidden: (title: string) => boolean; onNew?: () => void }) {
	const reminders = useReminders();
	const own = useLists();
	const members = useMembers().data ?? [];
	// Each list's color and its items' dragged order, kept on the wall by list name.
	const settings = useSettings().data;
	const colors = (settings?.listColors as Record<string, string> | undefined) ?? {};
	const orders = (settings?.listOrder as Record<string, string[]> | undefined) ?? {};
	const setSetting = useSetSetting();
	if (reminders.isPending || own.isPending) return null;
	const all: CardList[] = [
		...(own.data ?? []).map((l) => ({ ...l, source: "sprig" as const, syncedBy: [] })),
		...(reminders.data?.lists ?? []).map((l) => ({ ...l, id: l.title, source: "reminders" as const })),
	];
	if (all.length === 0) {
		return (
			<div className={s.setup}>
				<h2>No lists yet</h2>
				<p>Make one for groceries, to-dos or packing. Anyone can add to it and tick things off.</p>
				{onNew && <button className={s.choose} onClick={onNew}>+ New list</button>}
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
					// Until one is picked, each list gets the next color in turn.
					color={colors[l.title.toLowerCase()] ?? LIST_COLORS[all.indexOf(l) % LIST_COLORS.length]}
					onColor={(c) => setSetting.mutate({ key: "listColors", value: { ...colors, [l.title.toLowerCase()]: c } })}
					order={orders[l.title.toLowerCase()] ?? []}
					onReorder={(order) => setSetting.mutate({ key: "listOrder", value: { ...orders, [l.title.toLowerCase()]: order } })}
				/>
			))}
		</div>
	);
}

/** Starting a new list of Sprig's own. */
function NewListSheet({ onClose }: { onClose: () => void }) {
	const { addList } = useListActions();
	const [title, setTitle] = useState("");
	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={`${sheet.sheet} ${sheet.confirm}`} role="dialog" aria-label="New list"
				onSubmit={(e) => {
					e.preventDefault();
					if (title.trim()) addList.mutate(title, { onSuccess: onClose });
				}}>
				<h2 className={sheet.heading}>New list</h2>
				<input className={s.nameInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Groceries, To do, Packing…"
					maxLength={100} autoFocus aria-label="List name" />
				{addList.isError && <p className={s.error}>{addList.error.message}</p>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
					<button type="submit" className={sheet.primary} disabled={!title.trim() || addList.isPending}>Make it</button>
				</div>
			</form>
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
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={`${sheet.sheet} ${sheet.confirm}`} role="dialog" aria-label={`Change ${list.title}`}
				onSubmit={(e) => {
					e.preventDefault();
					if (title.trim() && title.trim() !== list.title) renameList.mutate({ id: list.id, title }, { onSuccess: onClose });
					else onClose();
				}}>
				<h2 className={sheet.heading}>{list.title}</h2>
				<input className={s.nameInput} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-label="List name" />
				{(renameList.error ?? deleteList.error) && <p className={s.error}>{(renameList.error ?? deleteList.error)!.message}</p>}
				<div className={sheet.actions}>
					<button type="button" className={sheet.danger}
						onClick={() => (deleting ? deleteList.mutate(list.id, { onSuccess: onClose }) : setDeleting(true))}>
						{deleting ? `Delete it and its ${list.items.length} items` : "Delete list"}
					</button>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
					<button type="submit" className={sheet.primary} disabled={!title.trim()}>Save</button>
				</div>
			</form>
		</>
	);
}

/** An item on one of Sprig's lists: when it's due (a day, and a time if it matters) and who it's for, or delete it. */
function ItemSheet({ item, members, onClose }: { item: CardItem; members: Member[]; onClose: () => void }) {
	const { update, remove } = useListActions();
	const [day, setDay] = useState(item.due ? (isDay(item.due) ? item.due : dayKey(new Date(item.due))) : "");
	const [time, setTime] = useState(item.due && !isDay(item.due) ? hhmm(item.due) : "");
	const [who, setWho] = useState(item.memberId ?? null);
	const [deleting, setDeleting] = useState(false);
	const { text } = splitIcon(item.title);
	function save() {
		const due = !day ? null : time ? toInstant(day, time) : day;
		update.mutate({ id: item.id, due, memberId: who });
		onClose();
	}
	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<div className={`${sheet.sheet} ${sheet.confirm}`} role="dialog" aria-label={text}>
				<div className={sheet.head}>
					<h2 className={sheet.heading}>{text}</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">×</button>
				</div>
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
						<button type="button" className={s.clearDone} onClick={() => { setDay(""); setTime(""); }}>No date</button>
					)}
				</div>
				<p className={s.pickNote}>With a day, it shows under Needs you on Today when it's due.</p>
				<div className={s.pickNote}>Who it's for</div>
				<div className={s.whoRow}>
					{members.map((m) => (
						<PickChip key={m.id} name={m.name} color={m.color} on={who === m.id} onClick={() => setWho(who === m.id ? null : m.id)} />
					))}
				</div>
				<div className={sheet.actions}>
					<button type="button" className={sheet.danger}
						onClick={() => (deleting ? remove.mutate(item.id, { onSuccess: onClose }) : setDeleting(true))}>
						{deleting ? "Tap again to delete" : "Delete"}
					</button>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
					<button type="button" className={sheet.primary} onClick={save}>Save</button>
				</div>
			</div>
		</>
	);
}
