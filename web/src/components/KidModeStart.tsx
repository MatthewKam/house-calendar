import type { CSSProperties } from "react";
import { textOn } from "../lib/color";
import type { Member } from "../lib/types";
import Sheet from "./Sheet";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/KidMode.module.css";

/** Starting kid mode on this device: which kid it opens on (the name at the top switches to the others). */
export default function KidModeStart({ kids, needsPin, onPick, onClose }: {
	kids: Member[];
	/** No guardian has a PIN yet, so no one could get back out. */
	needsPin: boolean;
	onPick: (id: string) => void;
	onClose: () => void;
}) {
	return (
		<>
			<Sheet label="Kid mode" onClose={onClose} className={sheet.confirm}>
				<h2 className={sheet.heading}>Kid mode</h2>
				{needsPin ? (
					<div className={sheet.body}>
						Set a guardian PIN first (Settings, then Household access), so only a grown-up can leave kid mode.
					</div>
				) : kids.length === 0 ? (
					<div className={sheet.body}>Add a kid with a birthday in Settings first.</div>
				) : (
					<>
						<div className={sheet.body}>
							Who's it for? Just their day, tasks, stars and jars, in big pictures; tap their name at the top to switch kids. To leave, tap the exit button in the corner and type a guardian's PIN.
						</div>
						<div className={s.startPicks}>
							{kids.map((k) => (
								<button key={k.id} type="button" className={s.startPick}
									style={{ "--c": k.color, "--on": textOn(k.color) } as CSSProperties} onClick={() => onPick(k.id)}>
									<span className={s.faceDot} aria-hidden="true">{k.name.slice(0, 1)}</span>
									{k.name}
								</button>
							))}
						</div>
					</>
				)}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
				</div>
			</Sheet>
		</>
	);
}
