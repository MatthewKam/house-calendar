import { useEffect, useState } from "react";
import { useGoalActions, useGoalLibrary } from "../lib/queries";
import { MOMENT_KINDS } from "../lib/moments";
import type { Goal, Member, MomentKind } from "../lib/types";
import IconPicker from "./IconPicker";
import PointsStepper from "./PointsStepper";
import ConfirmBelow from "./ConfirmBelow";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Goals.module.css";

/** Working on a few at a time keeps it focused (server/goals.ts). */
const MAX_WORKING = 3;
/** What a goal is worth unless the parent changes it: more than a moment, since it takes weeks. */
const GOAL_STARS = 5;
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
 * one of your own) at the stars you pick, and the ones they've got. Starter goals the family won't
 * use can be hidden from the list.
 */
export default function GoalsSheet({ kid, goals, today, onClose }: Props) {
	const library = useGoalLibrary().data ?? [];
	const { start, remove, hide, hideAll, save } = useGoalActions();
	// Shown when a goal is picked while they're already working on the most: remove one first.
	const [fullNotice, setFullNotice] = useState<string | null>(null);
	const [showAll, setShowAll] = useState(false);
	// Choosing which starter goals show: every one, tapped to hide or show it.
	const [choosing, setChoosing] = useState(false);
	const [points, setPoints] = useState(GOAL_STARS);
	const [own, setOwn] = useState<{ title: string; emoji: string | null; kind: MomentKind } | null>(null);
	// The goal asking "Remove?" below itself.
	const [confirmId, setConfirmId] = useState<string | null>(null);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const working = goals.filter((g) => !g.doneDay);
	const done = goals.filter((g) => g.doneDay);
	const full = working.length >= MAX_WORKING;
	const taken = new Set(working.map((g) => g.libraryKey));
	// Starter goals for their stage (and the family's own, for any age) first; the rest behind "Show goals for every age".
	const forAge = showAll || !kid.stage ? library : library.filter((g) => g.stages.length === 0 || g.stages.includes(kid.stage!));
	const shown = choosing ? library : forAge.filter((g) => !g.hidden && !taken.has(g.key));
	const hiddenCount = library.filter((g) => g.hidden).length;
	const problem = start.error?.message ?? remove.error?.message;

	const removeRow = (g: Goal) =>
		confirmId === g.id && (
			<ConfirmBelow
				text={g.doneDay
					? `Remove "${g.title}" from Did it!?${g.stars ? ` Its ${g.stars} ★ go too.` : ""}`
					: `Stop working on "${g.title}"?`}
				busy={remove.isPending}
				onCancel={() => setConfirmId(null)}
				onConfirm={() => remove.mutate(g.id, {
					onSuccess: () => {
						setConfirmId(null);
						setFullNotice(null);
					},
				})}
			/>
		);

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
							<li key={g.id}>
								<div className={s.item}>
									<span className={s.itemEmoji} aria-hidden="true">{g.emoji}</span>
									<span className={s.itemTitle}>
										{g.title}
										<span className={s.itemNote}>Worth {g.points ? `${g.points} ★` : "a sticker"}</span>
									</span>
									<button type="button" className={s.textButton} onClick={() => setConfirmId(g.id)}>Remove</button>
								</div>
								{removeRow(g)}
							</li>
						))}
					</ul>
				)}
				{problem && <p className={s.problem}>{problem}</p>}

				<h3 className={s.subhead}>{choosing ? "Choose which goals show" : "Add a goal"}</h3>
				{choosing ? (
					<>
						<p className={s.hint}>Tap a goal to hide it from the list, or tap it again to bring it back. Your own goals stay here until you hide them.</p>
						<div className={s.allButtons}>
							<button type="button" className={s.allButton} disabled={hideAll.isPending || hiddenCount === 0}
								onClick={() => hideAll.mutate(false)}>
								Show all
							</button>
							<button type="button" className={s.allButton} disabled={hideAll.isPending || hiddenCount === library.length}
								onClick={() => hideAll.mutate(true)}>
								Hide all
							</button>
						</div>
					</>
				) : full ? (
					<p className={s.warning} role="status">
						{fullNotice ?? `${kid.name} is working on ${MAX_WORKING} goals, the most at once. Remove one above to add another. You can still add goals to the list.`}
					</p>
				) : (
					<div className={s.worth}>
						<span>Worth</span>
						<PointsStepper value={points} onChange={setPoints} max={50} />
					</div>
				)}
				{!choosing && own ? (
					<form className={s.own} onSubmit={(e) => {
						e.preventDefault();
						if (!own.title.trim() || !own.emoji) return;
						const goal = { title: own.title.trim(), emoji: own.emoji, kind: own.kind };
						// Full: into the list only, for when one of theirs is done or removed.
						if (full) {
							save.mutate(goal, {
								onSuccess: () => {
									setOwn(null);
									setFullNotice(`"${goal.title}" is in the list. Remove one of ${kid.name}'s goals above to add it.`);
								},
							});
						} else {
							start.mutate({ memberId: kid.id, day: today, points, ...goal }, { onSuccess: () => setOwn(null) });
						}
					}}>
						<input className={s.input} placeholder="What are they working on?" aria-label="Goal" maxLength={80} autoFocus
							value={own.title} onChange={(e) => setOwn({ ...own, title: e.target.value })} />
						<div className={s.kindChoices} role="group" aria-label="Activity">
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
							<button type="submit" className={sheet.primary} disabled={!own.title.trim() || !own.emoji || start.isPending || save.isPending}>
								{full ? "Add to the list" : "Add"}
							</button>
						</div>
					</form>
				) : (
					<>
						<div className={s.library}>
							{shown.map((g) => (
								<button key={g.key} type="button" className={`${s.tile} ${choosing && g.hidden ? s.tileHidden : ""}`}
									disabled={start.isPending || hide.isPending || hideAll.isPending}
									aria-pressed={choosing ? !g.hidden : undefined}
									onClick={() => choosing
										? hide.mutate({ key: g.key, hidden: !g.hidden })
										: full
											? setFullNotice(`To add "${g.title}", remove one of ${kid.name}'s ${MAX_WORKING} goals above first.`)
											: start.mutate({ memberId: kid.id, day: today, points, libraryKey: g.key })}>
									<span className={s.tileEmoji} aria-hidden="true">{g.emoji}</span>
									<span>{g.title}</span>
									{choosing && <span className={s.tileState}>{g.hidden ? "Hidden" : "Showing"}</span>}
								</button>
							))}
							{!choosing && (
								<button type="button" className={`${s.tile} ${s.ownTile}`}
									onClick={() => setOwn({ title: "", emoji: null, kind: "self_care" })}>
									<span className={s.tileEmoji} aria-hidden="true">✏️</span>
									<span>Your own</span>
								</button>
							)}
						</div>
						<div className={s.libraryLinks}>
							{!choosing && kid.stage && (
								<button type="button" className={s.textButton} onClick={() => setShowAll(!showAll)}>
									{showAll ? "Just ones for their age" : "Show goals for every age"}
								</button>
							)}
							<button type="button" className={s.textButton} onClick={() => setChoosing(!choosing)}>
								{choosing ? "Done" : `Choose which show${hiddenCount ? ` (${hiddenCount} hidden)` : ""}`}
							</button>
						</div>
					</>
				)}

				{done.length > 0 && (
					<>
						<h3 className={s.subhead}>Did it! 🏆</h3>
						<ul className={s.list}>
							{done.map((g) => (
								<li key={g.id}>
									<div className={s.item}>
										<span className={s.itemEmoji} aria-hidden="true">{g.emoji}</span>
										<span className={s.itemTitle}>
											{g.title}
											<span className={s.itemNote}>
												{new Date(`${g.doneDay}T12:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
												{g.stars ? ` · ${g.stars} ★` : ""}
												{g.note && ` · ${g.note}`}
											</span>
										</span>
										<button type="button" className={s.textButton} onClick={() => setConfirmId(g.id)}>Remove</button>
									</div>
									{removeRow(g)}
								</li>
							))}
						</ul>
					</>
				)}
			</div>
		</>
	);
}
