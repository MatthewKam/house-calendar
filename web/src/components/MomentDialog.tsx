import { useMemo, useState } from "react";
import { addDays, dayKey, fromDayKey } from "../lib/dates";
import { useMomentActions, useMomentHistory } from "../lib/queries";
import { MOMENT_KINDS, momentKind } from "../lib/moments";
import type { Member, MomentKind } from "../lib/types";
import { PickChip } from "./NameChip";
import PointsStepper from "./PointsStepper";
import ConfirmBelow from "./ConfirmBelow";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Moments.module.css";
import g from "../styles/Goals.module.css";
import Sheet from "./Sheet";

/** How far back the history goes. */
const HISTORY_DAYS = 30;

interface Props {
	/** The kids to pick from. */
	kids: Member[];
	today: string;
	onClose: () => void;
}

/**
 * Parents only: caught a kid being good. Pick the kid, the activity and the stars (a note too, if
 * you like), and the cheer follows on every screen. History lists what's been caught lately, to take
 * one back that was added by mistake.
 */
export default function MomentDialog({ kids, today, onClose }: Props) {
	const { add, remove } = useMomentActions();
	const [tab, setTab] = useState<"catch" | "history">("catch");
	const [kidId, setKidId] = useState<string | null>(kids.length === 1 ? kids[0].id : null);
	const [kind, setKind] = useState<MomentKind | null>(null);
	const [stars, setStars] = useState(1);
	const [note, setNote] = useState("");
	const from = useMemo(() => dayKey(addDays(fromDayKey(today), -HISTORY_DAYS)), [today]);
	const history = useMomentHistory(from, today).data ?? [];
	// The moment asking "Remove?" below itself.
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const ready = kidId && kind;
	const day = (d: string) => (d === today ? "Today" : fromDayKey(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }));

	return (
		<>
			<Sheet label="Caught being good" onClose={onClose}>
				<div className={sheet.head}>
					<h2 className={sheet.heading}>✨ Caught being good</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">×</button>
				</div>
				<div className={s.tabs} role="tablist">
					<button type="button" role="tab" aria-selected={tab === "catch"} onClick={() => setTab("catch")}>Catch one</button>
					<button type="button" role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>History</button>
				</div>

				{tab === "catch" ? (
					<form className={s.form} onSubmit={(e) => {
						e.preventDefault();
						if (!kidId || !kind) return;
						add.mutate({ memberId: kidId, kind, stars, note: note.trim() || undefined, day: today }, { onSuccess: onClose });
					}}>
						<h3 className={g.subhead}>Who</h3>
						<div className={s.kids}>
							{kids.map((k) => (
								<PickChip key={k.id} name={k.name} color={k.color} on={kidId === k.id} onClick={() => setKidId(k.id)} />
							))}
						</div>
						<h3 className={g.subhead}>What for</h3>
						<div className={s.kinds}>
							{MOMENT_KINDS.map((k) => (
								<button key={k.kind} type="button" className={s.kind} aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
									<span className={s.kindEmoji} aria-hidden="true">{k.emoji}</span>
									<span>{k.label}</span>
								</button>
							))}
						</div>
						<h3 className={g.subhead}>Worth</h3>
						<PointsStepper value={stars} onChange={setStars} />
						<input className={s.note} placeholder="What did they do? (optional)" aria-label="Note" maxLength={300}
							value={note} onChange={(e) => setNote(e.target.value)} />
						{add.isError && <p className={s.problem}>{add.error.message}</p>}
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
							<button type="submit" className={sheet.primary} disabled={!ready || add.isPending}>Save 🎉</button>
						</div>
					</form>
				) : history.length === 0 ? (
					<p className={g.hint}>Nothing caught in the last {HISTORY_DAYS} days.</p>
				) : (
					<ul className={g.list}>
						{history.map((mo) => {
							const k = momentKind(mo.kind);
							const who = kids.find((kid) => kid.id === mo.memberId);
							return (
								<li key={mo.id}>
									<div className={g.item}>
										<span className={g.itemEmoji} aria-hidden="true">{k.emoji}</span>
										<span className={g.itemTitle}>
											{who?.name ?? "Someone"} · {k.label}
											<span className={g.itemNote}>
												{day(mo.day)} · {mo.stars ? `${mo.stars} ★` : "Sticker"}
												{mo.note && ` · ${mo.note}`}
											</span>
										</span>
										<button type="button" className={g.textButton} onClick={() => setConfirmId(mo.id)}>Remove</button>
									</div>
									{confirmId === mo.id && (
										<ConfirmBelow
											text={mo.stars ? `Remove this? ${who?.name ?? "Their"}'s ${mo.stars} ★ go too.` : "Remove this sticker?"}
											busy={remove.isPending}
											onCancel={() => setConfirmId(null)}
											onConfirm={() => remove.mutate(mo.id, { onSuccess: () => setConfirmId(null) })}
										/>
									)}
								</li>
							);
						})}
					</ul>
				)}
				{tab === "history" && remove.isError && <p className={s.problem}>{remove.error.message}</p>}
			</Sheet>
		</>
	);
}
