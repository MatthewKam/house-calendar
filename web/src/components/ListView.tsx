import { useState, type FormEvent } from "react";
import {
	useChangeReminders,
	useReminders,
	useSetSetting,
	useSettings,
} from "../lib/queries";
import type { ReminderList } from "../lib/types";
import { GROCERY_ICONS, splitIcon, suggestIcon } from "../lib/emoji";
import IconPicker from "./IconPicker";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/ListView.module.css";

/** "5 min ago", "2 h ago", "Oct 4". */
function ago(iso: string) {
	const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
	if (min < 1) return "just now";
	if (min < 60) return `${min} min ago`;
	if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
	return new Date(iso).toLocaleDateString([], {
		month: "short",
		day: "numeric",
	});
}

function ListCard({ list }: { list: ReminderList }) {
	const { add, setDone, rename } = useChangeReminders();
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
		add.mutate(
			{
				list: list.title,
				title: addIcon ? `${addIcon} ${typed.text}` : typed.text,
			},
			{
				onSuccess: () => {
					setTitle("");
					setNewIcon(undefined);
				},
			},
		);
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

	return (
		<section className={s.card}>
			<header className={s.head}>
				<h2 className={s.title}>{list.title}</h2>
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
			<ul className={s.items}>
				{list.items.map((it) => {
					const { icon, text } = splitIcon(it.title);
					// No icon in its name: show a suggested one, lighter, until it's picked.
					const suggested = icon ? null : suggestIcon(text);
					const toggle = () => setDone.mutate({ id: it.id, done: !it.done });
					return (
						<li key={it.id} className={`${s.row} ${it.done ? s.done : ""}`}>
							<button
								className={s.boxButton}
								aria-pressed={it.done}
								aria-label={`${text}: ${it.done ? "done" : "not done"}`}
								onClick={toggle}
							>
								<span className={s.box} aria-hidden="true">
									{it.done ? "✓" : ""}
								</span>
							</button>
							<button
								className={`${s.iconSpot} ${suggested ? s.suggested : ""} ${!icon && !suggested ? s.noIcon : ""}`}
								onClick={() => setPicking({ id: it.id, title: it.title })}
								aria-label={`Icon for ${text}`}
								title={
									icon
										? "Change icon"
										: suggested
											? "Suggested icon: tap to keep or change"
											: "Add an icon"
								}
							>
								{icon ?? suggested ?? "+"}
							</button>
							<button className={s.item} onClick={toggle} tabIndex={-1}>
								<span className={s.text}>{text}</span>
								{/* Changed here; it reaches Reminders at the next sync. */}
								{it.pending && (
									<span className={s.pending} title="Waiting to sync">
										↻
									</span>
								)}
							</button>
						</li>
					);
				})}
				{list.items.length === 0 && <li className={s.empty}>Nothing here.</li>}
			</ul>
			<form className={s.add} onSubmit={submit}>
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
			{(add.isError || setDone.isError || rename.isError) && (
				<p className={s.error}>
					Couldn't save: {(add.error ?? setDone.error ?? rename.error)?.message}
				</p>
			)}
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
						<p className={s.pickNote}>
							The icon is added to the start of its name in Reminders, so it
							shows on your phones too.
						</p>
					</div>
				</>
			)}
		</section>
	);
}

/** The family's iCloud Reminders lists, synced through an iPhone Shortcut on each phone. */
/** The Lists page: shared iCloud Reminders lists, synced through the phones. */
export default function ListView() {
	// Lists hidden from the wall, by name (lowercase, so a renamed capital doesn't bring one back).
	const hidden =
		(useSettings().data?.hiddenLists as string[] | undefined) ?? [];
	const setSetting = useSetSetting();
	const lists = useReminders().data?.lists ?? [];
	const [choosing, setChoosing] = useState(false);
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
	const hiddenCount = lists.filter((l) => isHidden(l.title)).length;

	return (
		<section className={s.page} aria-label="Lists">
			<header className={s.pageHead}>
				<h1 className={s.pageTitle}>Lists</h1>
				{lists.length > 0 && (
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
			<Lists hidden={isHidden} />
		</section>
	);
}

function Lists({ hidden }: { hidden: (title: string) => boolean }) {
	const { data, isPending } = useReminders();
	if (isPending) return null;
	if (!data?.enabled) {
		return (
			<div className={s.setup}>
				<h2>Reminders aren't connected yet</h2>
				<p>
					Add <code>REMINDERS_TOKEN</code> to <code>.env</code>, restart, and
					set up the Reminders Shortcut on each iPhone. The README's "Connect
					Reminders" section has the steps.
				</p>
			</div>
		);
	}
	if (data.lists.length === 0) {
		return (
			<div className={s.setup}>
				<h2>Waiting for a phone</h2>
				<p>
					Your lists show up here after the Reminders Shortcut runs on an iPhone
					for the first time.
				</p>
			</div>
		);
	}
	const shown = data.lists.filter((l) => !hidden(l.title));
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
				<ListCard key={l.title} list={l} />
			))}
		</div>
	);
}
