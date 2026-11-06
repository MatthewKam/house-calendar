import { useState, type CSSProperties } from "react";
import { usePottyActions } from "../lib/queries";
import { PEE_POO, POTTY_STEPS, ROW_PUNCHES } from "../lib/potty";
import type { Member, PottyChart, PottyStep } from "../lib/types";
import type { Cheer } from "../lib/useCheer";
import { textOn } from "../lib/color";
import Celebration from "./Celebration";
import ConfirmDialog from "./ConfirmDialog";
import { StarIcon } from "./icons";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Potty.module.css";

interface Props {
	kid: Member;
	chart: PottyChart;
	/** A parent may take a punch back and stop the chart. */
	parent: boolean;
	/** Kid mode: bigger. */
	big?: boolean;
}

/** "took 6 days", from a card's start to when it filled. */
function took(c: { startedAt: string; finishedAt: string }) {
	const days = Math.max(1, Math.round((Date.parse(c.finishedAt) - Date.parse(c.startedAt)) / 86_400_000));
	return `took ${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * A kid's potty chart: a punch card with a row per step of a trip (7 punches fill a row, and a full
 * row is a star), and "Potty time!" to punch the steps they did. A full card cheers and a fresh one
 * starts. Parents can take a row's last punch back, or stop the chart.
 */
export default function PottyCard({ kid, chart, parent, big }: Props) {
	const { setOn, takeBack } = usePottyActions();
	const [trip, setTrip] = useState(false);
	const [cheer, setCheer] = useState<Cheer | null>(null);
	const [stopping, setStopping] = useState(false);
	const last = chart.filled[0];

	return (
		<section className={`${s.card} ${big ? s.big : ""}`} style={{ "--c": kid.color, "--on": textOn(kid.color) } as CSSProperties}
			aria-label={`${kid.name}'s potty chart`}>
			<div className={s.head}>
				<h3 className={s.title}>🚽 Potty chart</h3>
				<button type="button" className={s.go} onClick={() => setTrip(true)}>Potty time!</button>
			</div>
			<ul className={s.rows}>
				{POTTY_STEPS.map(({ step, emoji, label }) => {
					const punches = chart.card.rows[step];
					const full = punches.length >= ROW_PUNCHES;
					return (
						<li key={step} className={s.row}>
							<span className={s.rowLabel} title={label}>
								<span className={s.rowEmoji} aria-hidden="true">{emoji}</span>
								<span className={s.rowText}>{label}</span>
							</span>
							<span className={s.holes} aria-label={`${punches.length} of ${ROW_PUNCHES}`}>
								{Array.from({ length: ROW_PUNCHES }, (_, i) => (
									<span key={i} className={`${s.hole} ${i < punches.length ? s.punched : ""}`} aria-hidden="true">
										{punches[i] ? PEE_POO[punches[i]] : ""}
									</span>
								))}
							</span>
							<span className={`${s.star} ${full ? s.starOn : ""}`} aria-label={full ? "Star earned" : "No star yet"}>
								<StarIcon />
							</span>
							{parent && (
								<button type="button" className={s.undo} disabled={!punches.length || takeBack.isPending}
									aria-label={`Take back a punch from ${label}`} title="Take back the last punch"
									onClick={() => takeBack.mutate({ memberId: kid.id, step })}>
									↶
								</button>
							)}
						</li>
					);
				})}
			</ul>
			{takeBack.isError && <p className={s.problem}>{takeBack.error.message}</p>}
			<div className={s.foot}>
				{last && <span>Cards filled: {chart.filled.length} (the last {took(last)})</span>}
				<span className={s.spacer} />
				{parent && !big && (
					<button type="button" className={s.textButton} onClick={() => setStopping(true)}>Stop chart</button>
				)}
			</div>

			{trip && <PottyTrip kid={kid} chart={chart} onCheer={setCheer} onClose={() => setTrip(false)} />}
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
					}}
				>
					Their card and stars are kept. Start it again any time to pick up where they left off.
				</ConfirmDialog>
			)}
		</section>
	);
}

/** One potty trip: the five steps as big buttons, each punching its row once. The go step asks pee or poo. */
function PottyTrip({ kid, chart, onCheer, onClose }: {
	kid: Member;
	chart: PottyChart;
	onCheer: (cheer: Cheer) => void;
	onClose: () => void;
}) {
	const { punch } = usePottyActions();
	// Steps punched on this trip.
	const [done, setDone] = useState<PottyStep[]>([]);

	function tap(step: PottyStep, kind?: "pee" | "poo") {
		setDone((d) => [...d, step]);
		punch.mutate({ memberId: kid.id, step, kind }, {
			onSuccess: ({ rowFull, cardFull }) => {
				if (cardFull) onCheer({ names: [kid.name], emoji: "🏆", message: "The whole potty card is full! Here's a new one." });
				else if (rowFull) onCheer({ names: [kid.name], emoji: "⭐", message: "A full row: that's a star!" });
			},
			onError: () => setDone((d) => d.filter((x) => x !== step)),
		});
	}

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<div className={sheet.sheet} role="dialog" aria-modal="true" aria-label="Potty time"
				style={{ "--c": kid.color, "--on": textOn(kid.color) } as CSSProperties}>
				<div className={sheet.head}>
					<h2 className={sheet.heading}>🚽 Potty time, {kid.name}!</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">×</button>
				</div>
				<div className={s.steps}>
					{POTTY_STEPS.map(({ step, emoji, label }) => {
						const full = chart.card.rows[step].length >= ROW_PUNCHES;
						const did = done.includes(step);
						if (step === "go" && !did && !full) {
							return (
								<div key={step} className={s.goStep}>
									<span className={s.stepLabel}>{label}</span>
									<div className={s.goPicks}>
										{(["pee", "poo"] as const).map((k) => (
											<button key={k} type="button" className={s.step} onClick={() => tap("go", k)}>
												<span className={s.stepEmoji} aria-hidden="true">{PEE_POO[k]}</span>
												{k === "pee" ? "Pee" : "Poo"}
											</button>
										))}
									</div>
								</div>
							);
						}
						return (
							<button key={step} type="button" className={`${s.step} ${did ? s.stepDone : ""}`}
								disabled={did || full} aria-pressed={did} onClick={() => tap(step)}>
								<span className={s.stepEmoji} aria-hidden="true">{did ? "✅" : full ? "⭐" : emoji}</span>
								<span className={s.stepLabel}>{label}</span>
								{full && !did && <span className={s.stepNote}>Row full!</span>}
							</button>
						);
					})}
				</div>
				{punch.isError && <p className={s.problem}>{punch.error.message}</p>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.primary} onClick={onClose}>{done.length ? "All done 🎉" : "Close"}</button>
				</div>
			</div>
		</>
	);
}
