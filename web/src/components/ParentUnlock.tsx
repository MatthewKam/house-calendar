import { useEffect, useState, type FormEvent } from "react";
import { useParent } from "../lib/useParent";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Rewards.module.css";

/** Unlocks this device for parent changes with the master PIN (then `onDone`, e.g. opening Settings). */
export default function ParentUnlock({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
	const { unlock } = useParent();
	const [pin, setPin] = useState("");
	const [keep, setKeep] = useState(false);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	function submit(e: FormEvent) {
		e.preventDefault();
		unlock.mutate(
			{ pin, keep },
			{
				onSuccess: () => {
					onClose();
					onDone?.();
				},
				onError: () => setPin(""),
			},
		);
	}

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={`${sheet.sheet} ${sheet.confirm}`} role="dialog" aria-modal="true" aria-label="Parent unlock" onSubmit={submit}>
				<h2 className={sheet.heading}>Parents only</h2>
				<div className={sheet.body}>
					Unlock to add, change or delete events, tasks, jars, photos, lists and settings. It locks again after a few
					minutes, or when the screen saver comes on.
				</div>
				<input
					className={s.pin}
					type="password"
					inputMode="numeric"
					autoComplete="off"
					placeholder="Master PIN"
					aria-label="Master PIN"
					maxLength={64}
					value={pin}
					autoFocus
					onChange={(e) => setPin(e.target.value)}
				/>
				<label className={s.keepUnlocked}>
					<input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
					Keep this device unlocked (a parent's own phone)
				</label>
				{unlock.isError && <div className={s.problem}>{unlock.error.message}</div>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className={sheet.primary} disabled={!pin || unlock.isPending}>
						Unlock
					</button>
				</div>
			</form>
		</>
	);
}
