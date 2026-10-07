import { useState, type FormEvent } from "react";
import {
	useChangeReminders,
	useReminders,
	useSetSetting,
	useSettings,
} from "../lib/queries";
import type { ReminderList } from "../lib/types";
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
	const { add, setDone } = useChangeReminders();
	const [title, setTitle] = useState("");
	const last = list.syncedBy[0];

	function submit(e: FormEvent) {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		add.mutate(
			{ list: list.title, title: t },
			{ onSuccess: () => setTitle("") },
		);
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
				{list.items.map((it) => (
					<li key={it.id}>
						<button
							className={`${s.item} ${it.done ? s.done : ""}`}
							aria-pressed={it.done}
							onClick={() => setDone.mutate({ id: it.id, done: !it.done })}
						>
							<span className={s.box} aria-hidden="true">
								{it.done ? "✓" : ""}
							</span>
							<span className={s.text}>{it.title}</span>
							{/* Changed here; a phone applies it in Reminders the next time its Shortcut runs. */}
							{it.pending && (
								<span className={s.pending} title="Waiting for a phone to sync">
									↻
								</span>
							)}
						</button>
					</li>
				))}
				{list.items.length === 0 && <li className={s.empty}>Nothing here.</li>}
			</ul>
			<form className={s.add} onSubmit={submit}>
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
			{(add.isError || setDone.isError) && (
				<p className={s.error}>
					Couldn't save: {(add.error ?? setDone.error)?.message}
				</p>
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
