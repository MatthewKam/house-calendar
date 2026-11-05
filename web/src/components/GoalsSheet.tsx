import { useEffect, useState } from "react";
import { useGoalActions, useGoalLibrary } from "../lib/queries";
import { MOMENT_KINDS } from "../lib/moments";
import type { Goal, Member, MomentKind } from "../lib/types";
import IconPicker from "./IconPicker";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Goals.module.css";

/** Working on a few at a time keeps it focused (server/goals.ts). */
const MAX_WORKING = 3;
const OWN_ICONS = ["⭐", "🌱", "🎯", "🧠", "❤️", "🏃", "🎵", "📚", "🧹", "🍎", "🛁", "😴"];

interface Props {
	kid: Member;
	/** This kid's goals, being worked on and done. */
	goals: Goal[];
	today: string;
	onClose: () => void;
}

/**
 * Parents only: a kid's goals. What they're working on, starter goals for their stage to add (or
 * one of your own), and the ones they've got.
 */
export default function GoalsSheet({ kid, goals, today, onClose }: Props) {
	const library = useGoalLibrary().data ?? [];
	const { start, remove } = useGoalActions();
	const [showAll, setShowAll] = useState(false);
	const [own, setOwn] = useState<{ title: string; emoji: string | null; kind: MomentKind } | null>(null);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const working = goals.filter((g) => !g.doneDay);
	const done = goals.filter((g) => g.doneDay);
	const full = working.length >= MAX_WORKING;
	const taken = new Set(working.map((g) => g.libraryKey));
	// Starter goals for their stage first; the rest behind "Show all".
	const forStage = library.filter((g) => !kid.stage || g.stages.includes(kid.stage));
	const shown = (showAll || !kid.stage ? library : forStage).filter((g) => !taken.has(g.key));
	const problem = start.error?.message ?? remove.error?.message;

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<div className={sheet.sheet} role="dialog" aria-modal="true" aria-label={`${kid.name}'s goals`}>
				<div className={sheet.head}>
					<h2 className={sheet.heading}>{kid.name}'s goals</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">×</button>
				</div>

				<h3 className={s.subhead}>Working on</h3>
				{working.length === 0 ? (
					<p className={s.hint}>Nothing yet. Pick one or two below; there's no deadline.</p>
				) : (
					<ul className={s.list}>
						{working.map((g) => (
							<li key={g.id} className={s.item}>
								<span className={s.itemEmoji} aria-hidden="true">{g.emoji}</span>
								<span className={s.itemTitle}>{g.title}</span>
								<button type="button" className={s.textButton}
									onClick={() => confirm(`Stop working on "${g.title}"?`) && remove.mutate(g.id)}>
									Remove
								</button>
							</li>
						))}
					</ul>
				)}
				{problem && <p className={s.problem}>{problem}</p>}

				<h3 className={s.subhead}>Add a goal</h3>
				{full ? (
					<p className={s.hint}>{MAX_WORKING} at once is plenty. Mark one done or remove one to add another.</p>
				) : own ? (
					<form className={s.own} onSubmit={(e) => {
						e.preventDefault();
						if (!own.title.trim() || !own.emoji) return;
						start.mutate({ memberId: kid.id, day: today, title: own.title.trim(), emoji: own.emoji, kind: own.kind },
							{ onSuccess: () => setOwn(null) });
					}}>
						<input className={s.input} placeholder="What are they working on?" aria-label="Goal" maxLength={80} autoFocus
							value={own.title} onChange={(e) => setOwn({ ...own, title: e.target.value })} />
						<div className={s.kindChoices} role="group" aria-label="Group">
							{MOMENT_KINDS.map((k) => (
								<button key={k.kind} type="button" className={s.kindChoice} aria-pressed={own.kind === k.kind}
									onClick={() => setOwn({ ...own, kind: k.kind })}>
									{k.emoji} {k.label}
								</button>
							))}
						</div>
						<IconPicker value={own.emoji} featured={OWN_ICONS} onChange={(emoji) => setOwn({ ...own, emoji })} />
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<button type="button" className={sheet.secondary} onClick={() => setOwn(null)}>Cancel</button>
							<button type="submit" className={sheet.primary} disabled={!own.title.trim() || !own.emoji || start.isPending}>
								Add
							</button>
						</div>
					</form>
				) : (
					<>
						<div className={s.library}>
							{shown.map((g) => (
								<button key={g.key} type="button" className={s.tile} disabled={start.isPending}
									onClick={() => start.mutate({ memberId: kid.id, day: today, libraryKey: g.key })}>
									<span className={s.tileEmoji} aria-hidden="true">{g.emoji}</span>
									<span>{g.title}</span>
								</button>
							))}
							<button type="button" className={`${s.tile} ${s.ownTile}`}
								onClick={() => setOwn({ title: "", emoji: null, kind: "myself" })}>
								<span className={s.tileEmoji} aria-hidden="true">✏️</span>
								<span>Your own</span>
							</button>
						</div>
						{kid.stage && forStage.length < library.length && (
							<button type="button" className={s.textButton} onClick={() => setShowAll(!showAll)}>
								{showAll ? "Just ones for their age" : "Show goals for every age"}
							</button>
						)}
					</>
				)}

				{done.length > 0 && (
					<>
						<h3 className={s.subhead}>Did it! 🏆</h3>
						<ul className={s.list}>
							{done.map((g) => (
								<li key={g.id} className={s.item}>
									<span className={s.itemEmoji} aria-hidden="true">{g.emoji}</span>
									<span className={s.itemTitle}>
										{g.title}
										<span className={s.itemNote}>
											{new Date(`${g.doneDay}T12:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
											{g.note && ` · ${g.note}`}
										</span>
									</span>
									<button type="button" className={s.textButton}
										onClick={() => confirm(`Remove "${g.title}" from the Did it! list?${g.stars ? ` Its ${g.stars} stars go too.` : ""}`)
											&& remove.mutate(g.id)}>
										Remove
									</button>
								</li>
							))}
						</ul>
					</>
				)}
			</div>
		</>
	);
}
