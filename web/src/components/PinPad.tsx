import { useEffect } from "react";
import s from "../styles/PinPad.module.css";

/** Guardian PINs are 4 to 8 digits (server/hosted.ts). */
const MAX = 8;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

/**
 * A guardian's PIN on a number pad, like a phone's lock screen: dots for the digits typed, and big keys.
 * A keyboard works too (digits, Backspace, Enter for `onEnter`).
 */
export default function PinPad({ value, onChange, onEnter }: { value: string; onChange: (pin: string) => void; onEnter: () => void }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (/^[0-9]$/.test(e.key)) onChange((value + e.key).slice(0, MAX));
			else if (e.key === "Backspace") onChange(value.slice(0, -1));
			else if (e.key === "Enter" && value) onEnter();
			else return;
			e.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [value, onChange, onEnter]);

	return (
		<div className={s.pad}>
			{/* Four dots to start, more as a longer PIN is typed. */}
			<div className={s.dots} role="status" aria-label={`${value.length} ${value.length === 1 ? "digit" : "digits"} typed`}>
				{Array.from({ length: Math.max(4, value.length) }, (_, i) => (
					<span key={i} className={`${s.dot} ${i < value.length ? s.filled : ""}`} />
				))}
			</div>
			<div className={s.keys}>
				{KEYS.map((k, i) =>
					k === "" ? (
						<span key={i} />
					) : k === "back" ? (
						<button key={i} type="button" className={`${s.key} ${s.back}`} aria-label="Delete" disabled={!value}
							onClick={() => onChange(value.slice(0, -1))}>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M9 5h10.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7zM12 9.5l5 5M17 9.5l-5 5" />
							</svg>
						</button>
					) : (
						<button key={i} type="button" className={s.key} disabled={value.length >= MAX}
							onClick={() => onChange(value + k)}>
							{k}
						</button>
					),
				)}
			</div>
		</div>
	);
}
