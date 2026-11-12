import { useState, type FormEvent } from "react";
import { useParent } from "../../lib/useParent";
import PinPad, { pinSheet } from "../ui/PinPad";
import sheet from "../ui/Sheet.module.css";
import Sheet from "../ui/Sheet";

/** Unlocks this device for parent changes with any guardian's PIN (then `onDone`, e.g. opening Settings). */
export default function ParentUnlock({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
	const { unlock } = useParent();
	const [pin, setPin] = useState("");

	function submit(e?: FormEvent, typed = pin) {
		e?.preventDefault();
		if (!typed || unlock.isPending) return;
		// Awaited rather than mutate's callbacks, which are dropped if the dialog re-renders from new while
		// the PIN is checked (it stayed open, with the button off, on phones).
		unlock.mutateAsync({ pin: typed }).then(
			() => {
				onClose();
				onDone?.();
			},
			() => setPin(""),
		);
	}

	return (
		<>
			<Sheet label="Parent unlock" onClose={onClose} className={`${sheet.confirm} ${pinSheet}`} onSubmit={submit}>
				<h2 className={sheet.heading}>Guardians only</h2>
				<div className={sheet.body}>
					Unlock to add, change or delete events, tasks, jars, photos, lists and settings. It locks again after a few
					minutes, or when the screen saver comes on.
				</div>
				<PinPad value={pin} onChange={setPin} onEnter={(typed) => submit(undefined, typed)} error={unlock.error?.message} done="Unlock" />
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className={sheet.primary} disabled={!pin || unlock.isPending}>
						Unlock
					</button>
				</div>
			</Sheet>
		</>
	);
}
