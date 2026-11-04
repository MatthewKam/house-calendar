import { useEffect, useState } from "react";
import { useMomentActions } from "../lib/queries";
import { MOMENT_KINDS } from "../lib/moments";
import type { Member } from "../lib/types";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Moments.module.css";

interface Props {
	kid: Member;
	today: string;
	onClose: () => void;
}

/**
 * Parents only: caught a kid being good. One tap on a picture saves it (a note first is optional),
 * and the cheer follows on every screen.
 */
export default function MomentDialog({ kid, today, onClose }: Props) {
	const { add } = useMomentActions();
	const [note, setNote] = useState("");

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<div className={`${sheet.sheet} ${sheet.confirm}`} role="dialog" aria-modal="true" aria-label={`Caught ${kid.name} being good`}>
				<div className={sheet.head}>
					<h2 className={sheet.heading}>Caught {kid.name} being good</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">×</button>
				</div>
				<input className={s.note} placeholder="What did they do? (optional)" aria-label="Note" maxLength={300}
					value={note} onChange={(e) => setNote(e.target.value)} />
				<div className={s.kinds}>
					{MOMENT_KINDS.map((k) => (
						<button key={k.kind} type="button" className={s.kind} disabled={add.isPending}
							onClick={() => add.mutate({ memberId: kid.id, kind: k.kind, note: note.trim() || undefined, day: today }, { onSuccess: onClose })}>
							<span className={s.kindEmoji} aria-hidden="true">{k.emoji}</span>
							<span>{k.label}</span>
						</button>
					))}
				</div>
				{add.isError && <p className={s.problem}>{add.error.message}</p>}
			</div>
		</>
	);
}
