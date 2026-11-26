import { useState, type FormEvent } from 'react';
import { useListActions } from '../../lib/queries';
import type { Member } from '../../lib/types';
import { dayKey, hhmm, toInstant } from '../../lib/dates';
import { isDay } from '../../lib/lists';
import { GROCERY_ICONS, splitIcon, suggestIcon } from '../../lib/emoji';
import { PickChip } from '../ui/NameChip';
import DateInput from '../ui/DateInput';
import IconPicker from '../ui/IconPicker';
import Sheet from '../ui/Sheet';
import Switch from '../ui/Switch';
import { Button, IconButton } from '../ui/Button';
import { Field, Fieldset, Input } from '../ui/Field';
import { List, ListRow } from '../ui/ListRow';
import sheet from '../ui/styles/Sheet.module.css';
import type { CardItem, CardList } from './ListCard';
import s from './ListView.module.css';

/** The icons offered first for an item: the one its name suggests, then groceries. */
export const iconChoices = (text: string) => [
	...new Set([suggestIcon(text), ...GROCERY_ICONS].filter((x): x is string => !!x)),
];

export const REMINDERS_ICON_NOTE =
	'The icon is added to the start of its name in Reminders, so it shows on your phones too.';

/** A list of Sprig's own: rename it, or delete it with everything on it. */
export function ListSheet({ list, onUnsort, onClose }: { list: CardList; onUnsort: () => void; onClose: () => void }) {
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
export function ItemSheet({ item, members, sprig, onRename, onClose }: ItemSheetProps) {
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
