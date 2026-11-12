import { useEffect, useState, type CSSProperties } from "react";
import { usePottyActions } from "../lib/queries";
import { peePoo, POTTY_STEPS, ROW_PUNCHES } from "../lib/potty";
import type { Member, PottyChart, PottyKind, PottyStep } from "../lib/types";
import type { Cheer } from "../lib/useCheer";
import { textOn } from "../lib/color";
import Celebration from "./Celebration";
import ConfirmDialog from "./ConfirmDialog";
import { StarIcon } from "./icons";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Potty.module.css";
import Sheet from "./Sheet";

type Kind = PottyKind | null;

interface Props {
	kid: Member;
	chart: PottyChart;
	/** Edit is offered (parents; in kid mode it asks for a PIN first). */
	canEdit: boolean;
	/** A grown-up says OK (their PIN) before editing, then `then` goes ahead. */
	askFirst?: (then: () => void) => void;
	/** The Tasks page: small, like the task rows around it (kid mode's is big, for toddlers). */
	compact?: boolean;
	/** Opened out of a "Potty chart" button (kid mode): joined to it, without its own title or Edit button
	    (the header has a pencil, which bumps `editAsked`). */
	attached?: boolean;
	editAsked?: number;
	/** The Tasks page: its title folds the chart away and back (kept on this device, a kid at a time). */
	foldable?: boolean;
}

/** Kids whose chart is folded away on the Tasks page, on this device. */
const FOLDED = 'sprig:potty-folded';
function foldedKids(): string[] {
	try {
		const ids = JSON.parse(localStorage.getItem(FOLDED) ?? '[]');
		return Array.isArray(ids) ? ids : [];
	} catch {
		return [];
	}
}
function setFolded(kidId: string, folded: boolean) {
	try {
		const rest = foldedKids().filter((id) => id !== kidId);
		localStorage.setItem(FOLDED, JSON.stringify(folded ? [...rest, kidId] : rest));
	} catch {
		// Private browsing or storage blocked: just this visit.
	}
}

/** "took 6 days", from a card's start to when it filled. */
function took(c: { startedAt: string; finishedAt: string }) {
	const days = Math.max(1, Math.round((Date.parse(c.finishedAt) - Date.parse(c.startedAt)) / 86_400_000));
	return `took ${days} ${days === 1 ? "day" : "days"}`;
}

const none = (): Record<PottyStep, Kind[]> => ({ ask: [], sit: [], go: [], wipe: [], wash: [] });
const zero = (): Record<PottyStep, number> => ({ ask: 0, sit: 0, go: 0, wipe: 0, wash: 0 });

/**
 * A kid's potty chart, sized for a toddler: a row per step of a trip (7 stickers fill a row, and a
 * full row is a star). Tapping the empty spot after the last sticker adds one (the go row asks pee,
 * poop or both); stickers already there do nothing. A row takes one new sticker at a time, kept on
 * Save. Parents' Edit takes stickers back (a row's last one first) or stops the chart.
 */
export default function PottyCard({ kid, chart, canEdit, askFirst, compact, attached, editAsked, foldable }: Props) {
	const [folded, fold] = useState(() => !!foldable && foldedKids().includes(kid.id));
	const { setOn, punch, takeBack } = usePottyActions();
	// Stickers added and not saved yet, per row.
	const [adding, setAdding] = useState(none);
	// Editing: how many of each row's last stickers come off on Save.
	const [editing, setEditing] = useState(false);
	const [removing, setRemoving] = useState(zero);
	// The go row's next spot was tapped: pee, poop or both?
	const [choosing, setChoosing] = useState(false);
	// Picked in it: pee, poop, or both (each a toggle).
	const [pee, setPee] = useState(false);
	const [poo, setPoo] = useState(false);
	const [saving, setSaving] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const [cheer, setCheer] = useState<Cheer | null>(null);
	const [stopping, setStopping] = useState(false);
	const last = chart.filled[0];

	// Another kid on the same card (kid mode's switch): start clean.
	useEffect(() => {
		setAdding(none());
		setRemoving(zero());
		setEditing(false);
	}, [kid.id]);

	// The header's pencil (attached): edit, as the Edit button would.
	useEffect(() => {
		if (editAsked) (askFirst ? askFirst(() => setEditing(true)) : setEditing(true));
		// Only when it's tapped.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editAsked]);

	const changed = POTTY_STEPS.some(({ step }) => adding[step].length > 0 || removing[step] > 0);
	const add = (step: PottyStep, kind: Kind) => setAdding((a) => ({ ...a, [step]: [...a[step], kind] }));

	function tapSpot(step: PottyStep, i: number) {
		const saved = chart.card.rows[step].length;
		const kept = saved - removing[step];
		if (editing) {
			// The last sticker kept comes off; the first one coming off stays after all.
			if (i === kept - 1) setRemoving((r) => ({ ...r, [step]: r[step] + 1 }));
			else if (i === kept && removing[step] > 0) setRemoving((r) => ({ ...r, [step]: r[step] - 1 }));
			return;
		}
		// A new sticker (not saved yet) tapped again comes back off.
		if (i === saved && adding[step].length > 0) {
			setAdding((a) => ({ ...a, [step]: [] }));
			return;
		}
		// Only the spot right after the last sticker adds one, and one per row until Save.
		if (i !== saved) return;
		if (step === "go") {
			setPee(false);
			setPoo(false);
			setChoosing(true);
		}
		else add(step, null);
	}

	function cancel() {
		setAdding(none());
		setRemoving(zero());
		setEditing(false);
		setProblem(null);
	}

	async function save() {
		setSaving(true);
		setProblem(null);
		let star = false;
		let card = false;
		try {
			for (const { step } of POTTY_STEPS) {
				for (let n = 0; n < removing[step]; n++) await takeBack.mutateAsync({ memberId: kid.id, step });
				for (const kind of adding[step]) {
					const r = await punch.mutateAsync({ memberId: kid.id, step, kind: kind ?? undefined });
					star ||= r.rowFull;
					card ||= r.cardFull;
				}
			}
			cancel();
		} catch (e) {
			setProblem((e as Error).message);
		} finally {
			setSaving(false);
		}
		if (card) setCheer({ names: [kid.name], emoji: "🏆", message: "The whole potty card is full! Here's a new one." });
		else if (star) setCheer({ names: [kid.name], emoji: "⭐", message: "A full row: that's a star!" });
	}

	return (
		<section className={`${s.card} ${compact ? s.compact : ""} ${attached ? s.attached : ""} ${editing ? s.editing : ""}`} style={{ "--c": kid.color, "--on": textOn(kid.color) } as CSSProperties}
			aria-label={`${kid.name}'s potty chart`}>
			{!attached && (
				<div className={s.head}>
					<h3 className={s.title}>
						{foldable ? (
							// Tap to fold away (and back); a chevron shows which.
							<button type="button" className={s.foldTitle} aria-expanded={!folded}
								onClick={() => { setFolded(kid.id, !folded); fold(!folded); }}>
								Potty chart <span className={s.logo} aria-hidden="true">🚽</span>
							</button>
						) : (
							<>Potty chart <span className={s.logo} aria-hidden="true">🚽</span></>
						)}
					</h3>
					{canEdit && !editing && !changed && !folded && (
						<button type="button" className={s.edit} onClick={() => (askFirst ? askFirst(() => setEditing(true)) : setEditing(true))}>
							Edit
						</button>
					)}
				</div>
			)}
			{/* Folded away (the Tasks page): just the title. */}
			{!folded && (
			<>
			{editing && <p className={s.hint}>Tap a row's last sticker to take it off, then Save.</p>}

			{POTTY_STEPS.map(({ step, emoji, label }) => {
				const saved = chart.card.rows[step];
				const kept = saved.length - removing[step];
				const spots: { kind: Kind; state: "saved" | "off" | "new" }[] = [
					...saved.map((kind, i) => ({ kind, state: i < kept ? ("saved" as const) : ("off" as const) })),
					...adding[step].map((kind) => ({ kind, state: "new" as const })),
				];
				// One new sticker per row each Save.
				const next = editing || adding[step].length > 0 ? -1 : spots.length;
				const full = kept + adding[step].length >= ROW_PUNCHES;
				return (
					<div key={step} className={s.row}>
						<div className={s.rowLabel}>
							<span className={s.rowEmoji} aria-hidden="true">{emoji}</span>
							{label}
						</div>
						<div className={s.spots}>
							{Array.from({ length: ROW_PUNCHES }, (_, i) => {
								const spot = spots[i];
								const sticker = spot ? (spot.kind ? peePoo(spot.kind).emoji : emoji) : "";
								const tappable = editing ? i === kept - 1 || (i === kept && removing[step] > 0) : i === next || spot?.state === "new";
								return (
									<button key={i} type="button"
										className={`${s.spot} ${spot ? s[spot.state] : ""} ${spot?.kind === "both" ? s.both : ""} ${i === next ? s.next : ""}`}
										aria-label={spot ? `${label}: sticker ${i + 1}${spot.state === "off" ? ", coming off" : spot.state === "new" ? ", tap to take it off" : ""}` : i === next ? `Add a sticker: ${label}` : `Spot ${i + 1}`}
										tabIndex={tappable ? 0 : -1}
										onClick={() => tapSpot(step, i)}>
										{sticker || (i === next ? "+" : "")}
									</button>
								);
							})}
							<span className={`${s.star} ${full ? s.starOn : ""}`} aria-label={full ? "Star earned" : "No star yet"}>
								<StarIcon />
							</span>
						</div>
					</div>
				);
			})}

			{problem && <p className={s.problem}>{problem}</p>}
			{(changed || editing) && (
				<div className={s.actions}>
					{editing && (
						<button type="button" className={s.stop} onClick={() => setStopping(true)}>Stop chart</button>
					)}
					<span className={s.spacer} />
					<button type="button" className={s.cancel} onClick={cancel} disabled={saving}>Cancel</button>
					<button type="button" className={s.save} onClick={() => void save()} disabled={!changed || saving}>Save ✓</button>
				</div>
			)}
			{last && <div className={s.foot}>Cards filled: {chart.filled.length} (the last {took(last)})</div>}

			{choosing && (
				<>
					<Sheet label="Pee or poop?" onClose={() => setChoosing(false)} className={s.chooser}>
						<div className={sheet.head}>
							<h2 className={s.chooseHeading}>Pee or poop?</h2>
							<button type="button" className={sheet.close} onClick={() => setChoosing(false)} aria-label="Close">×</button>
						</div>
						{/* Each one toggles; both on is both. */}
						<div className={s.choices}>
							{([[peePoo("pee"), pee, setPee], [peePoo("poo"), poo, setPoo]] as const).map(([k, on, set]) => (
								<button key={k.kind} type="button" className={s.choice} aria-pressed={on} onClick={() => set(!on)}>
									<span className={s.choiceEmoji} aria-hidden="true">{k.emoji}</span>
									{k.label}
									{on && <span className={s.choiceCheck} aria-hidden="true">✓</span>}
								</button>
							))}
						</div>
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<button type="button" className={s.save} disabled={!pee && !poo}
								onClick={() => {
									add("go", pee && poo ? "both" : pee ? "pee" : "poo");
									setChoosing(false);
								}}>
								OK ✓
							</button>
						</div>
					</Sheet>
				</>
			)}
			{cheer && <Celebration cheer={cheer} onDone={() => setCheer(null)} />}
			{stopping && (
				<ConfirmDialog
					safe
					title={`Stop ${kid.name}'s potty chart?`}
					confirmLabel="Stop"
					onCancel={() => setStopping(false)}
					onConfirm={() => {
						setOn.mutate({ memberId: kid.id, on: false });
						setStopping(false);
						cancel();
					}}
				>
					Their card and stars are kept. Start it again any time to pick up where they left off.
				</ConfirmDialog>
			)}
			</>
			)}
		</section>
	);
}
