import { useState, type KeyboardEvent } from "react";
import { suggestIcon } from "../../lib/emoji";
import { useSetChecklist, useTickChecklist } from "../../lib/queries";
import type { CalEvent, ChecklistItem } from "../../lib/types";
import IconPicker from "../ui/IconPicker";
import { PencilIcon } from "../ui/icons";
import s from "./EventChecklist.module.css";

/** Pictures to start from: what goes in a bag for a class, a game or a trip. */
const BRING_ICONS = ["🎒", "🥋", "👕", "👖", "🩳", "👟", "🧦", "🧥", "🧢", "💧", "🥨", "🍎", "🧴", "🥽", "🩴", "📚", "✏️", "⚽", "🩹", "💊"];

/** "3 of 4 packed", or "All packed". */
export const packed = (list: ChecklistItem[]) => {
	const done = list.filter((x) => x.done).length;
	return done === list.length ? "All packed" : `${done} of ${list.length} packed`;
};

/**
 * What to bring to an event: tick things off for this time (anyone can), or (not locked) change the
 * list, which is the same every time it repeats. Saves straight away, apart from the event's own Save.
 */
export default function EventChecklist({ event, locked }: { event: CalEvent; locked?: boolean }) {
	const tick = useTickChecklist();
	const save = useSetChecklist();
	const [draft, setDraft] = useState<ChecklistItem[] | null>(null);
	const [typed, setTyped] = useState("");
	// Which draft row's picture is being picked.
	const [picking, setPicking] = useState<number | null>(null);
	// The sheet was opened with the event as it was then: the list as it is now is kept here.
	const [list, setList] = useState(event.checklist);

	if (!draft) {
		if (list.length === 0 && locked) return null;
		return (
			<section className={s.box} aria-label="What to bring">
				<div className={s.head}>
					<span className={s.label}>🎒 What to bring</span>
					{list.length > 0 && <span className={s.count}>{packed(list)}</span>}
					{!locked && (
						<button type="button" className={s.edit} onClick={() => setDraft(list)}>
							{list.length ? <><PencilIcon /> Edit</> : "+ Add a list"}
						</button>
					)}
				</div>
				{list.length > 0 && (
					<ul className={s.items}>
						{list.map((x) => (
							<li key={x.id}>
								<button type="button" className={`${s.item} ${x.done ? s.done : ""}`} aria-pressed={x.done}
									disabled={save.isPending} onClick={() => {
										setList(list.map((y) => (y.id === x.id ? { ...y, done: !x.done } : y)));
										tick.mutate({ id: event.id, itemId: x.id, done: !x.done }, { onError: () => setList(list) });
									}}>
									<span className={s.tick} aria-hidden="true">{x.done ? "✓" : ""}</span>
									<Picture item={x} />
									<span className={s.title}>{x.title}</span>
								</button>
							</li>
						))}
					</ul>
				)}
				{list.length > 0 && <p className={s.note}>Ticks start fresh each time{event.repeats || event.calendarId !== "local" ? " it repeats" : ""}.</p>}
			</section>
		);
	}

	const change = (i: number, patch: Partial<ChecklistItem>) => setDraft(draft.map((x, j) => (j === i ? { ...x, ...patch } : x)));
	function add() {
		const title = typed.trim();
		if (!title) return;
		setDraft([...draft!, { id: `new-${Date.now()}`, title, picture: suggestIcon(title), done: false }]);
		setTyped("");
	}
	// Enter adds the item, rather than saving the event form it sits in.
	const onKey = (e: KeyboardEvent) => {
		if (e.key === "Enter") { e.preventDefault(); add(); }
	};
	function done() {
		// Something typed but not added yet counts too. New ones get their ids from the server.
		const items = [...draft!, ...(typed.trim() ? [{ id: `new-${Date.now()}`, title: typed.trim(), picture: suggestIcon(typed), done: false }] : [])]
			.filter((x) => x.title.trim());
		setList(items);
		// The saved list has the new ones' ids, to tick them by.
		save.mutate({ id: event.id, items }, { onSuccess: (saved) => setList(saved.checklist), onError: () => setList(list) });
		setDraft(null);
		setTyped("");
		setPicking(null);
	}

	return (
		<section className={s.box} aria-label="What to bring">
			<div className={s.head}>
				<span className={s.label}>🎒 What to bring</span>
				<span className={s.count}>Every time it repeats</span>
			</div>
			<ul className={s.items}>
				{draft.map((x, i) => (
					<li key={x.id} className={s.editRow}>
						<button type="button" className={s.pick} aria-label={`Picture for ${x.title}`} onClick={() => setPicking(picking === i ? null : i)}>
							{x.picture || suggestIcon(x.title) ? <Picture item={x} /> : <span className={s.noPicture}>+</span>}
						</button>
						<input className={s.input} value={x.title} maxLength={80} aria-label="Thing to bring"
							onChange={(e) => change(i, { title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
						<button type="button" className={s.remove} aria-label={`Remove ${x.title}`}
							onClick={() => { setDraft(draft.filter((_, j) => j !== i)); setPicking(null); }}>×</button>
						{picking === i && (
							<div className={s.picker}>
								<IconPicker value={x.picture} featured={[...new Set([suggestIcon(x.title), ...BRING_ICONS].filter((p): p is string => !!p))]}
									onChange={(picture) => { change(i, { picture }); setPicking(null); }} />
							</div>
						)}
					</li>
				))}
				<li className={s.editRow}>
					<span className={s.pick} aria-hidden="true">{suggestIcon(typed) ?? <span className={s.noPicture}>+</span>}</span>
					<input className={s.input} value={typed} maxLength={80} placeholder="Add a thing, e.g. belt or snack" aria-label="Add a thing to bring"
						autoFocus={draft.length === 0} onChange={(e) => setTyped(e.target.value)} onKeyDown={onKey} />
					<button type="button" className={s.addButton} onClick={add} disabled={!typed.trim()}>Add</button>
				</li>
			</ul>
			<div className={s.actions}>
				<button type="button" className={s.cancel} onClick={() => { setDraft(null); setTyped(""); setPicking(null); }}>Cancel</button>
				<button type="button" className={s.save} onClick={done}>Save list</button>
			</div>
		</section>
	);
}

/** Its picture, or (lighter) the one guessed from its name until one's picked. */
function Picture({ item }: { item: ChecklistItem }) {
	const guess = item.picture ? null : suggestIcon(item.title);
	if (!item.picture && !guess) return null;
	return <span className={`${s.picture} ${guess ? s.guess : ""}`} aria-hidden="true">{item.picture ?? guess}</span>;
}

/** A picture for a thing to bring: its own, or a guess from its name, or a bag. */
export const bringPicture = (x: ChecklistItem) => x.picture ?? suggestIcon(x.title) ?? "🎒";
