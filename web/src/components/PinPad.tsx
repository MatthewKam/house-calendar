import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import s from "../styles/PinPad.module.css";

/** For the dialog the pad is in: on a phone on its side, the words and buttons go beside the pad. */
export const pinSheet = s.sheet;

/** Guardian PINs are 4 to 8 digits (server/hosted.ts). */
const MAX = 8;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

/**
 * A guardian's PIN on a number pad, like a phone's lock screen: dots for the digits typed, and big keys.
 * A keyboard works too (digits, Backspace, Enter for `onEnter`). When every guardian's PIN is the same
 * length, there's a dot for each digit and it's checked as the last one goes in. `error`: what was
 * wrong with the last try ("Wrong PIN"), shown under the dots (with a shake) until typing starts again.
 */
export default function PinPad({ value, onChange, onEnter, error, done = "OK" }: {
	value: string;
	onChange: (pin: string) => void;
	onEnter: (pin: string) => void;
	error?: string | null;
	/** The dialog's button that checks it, for the hint when the PIN's length isn't known. */
	done?: string;
}) {
	// Each new error shakes the dots once.
	const [shakes, setShakes] = useState(0);
	useEffect(() => {
		if (error) setShakes((n) => n + 1);
	}, [error]);
	const status = useQuery({ queryKey: ["auth"], queryFn: api.authStatus }).data;
	const length = status?.signedIn ? status.pinLength : null;
	const max = length ?? MAX;
	// Tried to type past the longest a PIN can be.
	const [tooLong, setTooLong] = useState(false);
	useEffect(() => {
		if (value.length < max) setTooLong(false);
	}, [value, max]);
	function type(digit: string) {
		if (value.length >= max) {
			if (!length) setTooLong(true);
			return;
		}
		const next = value + digit;
		onChange(next);
		if (next.length === length) onEnter(next);
	}

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (/^[0-9]$/.test(e.key)) type(e.key);
			else if (e.key === "Backspace") onChange(value.slice(0, -1));
			else if (e.key === "Enter" && value) onEnter(value);
			else return;
			e.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value, length, onChange, onEnter]);

	return (
		<div className={s.pad}>
			{/* A dot for each digit of the PIN; or, not knowing its length, four to start and more as it's typed. */}
			<div key={shakes} className={`${s.dots} ${shakes ? s.shake : ""}`} role="status"
				aria-label={`${value.length} ${value.length === 1 ? "digit" : "digits"} typed`}>
				{Array.from({ length: length ?? Math.max(4, value.length) }, (_, i) => (
					<span key={i} className={`${s.dot} ${i < value.length ? s.filled : ""}`} />
				))}
			</div>
			{error && !value && <p className={s.error} role="alert">{error}</p>}
			{tooLong ? (
				<p className={s.error} role="alert">PINs are 4 to 8 digits</p>
			) : (
				// Not knowing how long the PIN is, it can't check by itself (it learns once one is right).
				!length && value.length >= 4 && <p className={s.hint}>Then tap {done}</p>
			)}
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
						<button key={i} type="button" className={s.key} disabled={!!length && value.length >= max} onClick={() => type(k)}>
							{k}
						</button>
					),
				)}
			</div>
		</div>
	);
}
