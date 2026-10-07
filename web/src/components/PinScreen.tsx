import { useEffect, useState } from "react";
import { api } from "../lib/api";
import s from "../styles/PinScreen.module.css";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/** Sign in with the family PIN: a big keypad for the wall and phones (a keyboard works too). */
export default function PinScreen({ onSignedIn }: { onSignedIn: () => void }) {
	const [pin, setPin] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(value = pin) {
		if (value.length < 4 || busy) return;
		setBusy(true);
		try {
			await api.login(value);
			onSignedIn();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setPin("");
		} finally {
			setBusy(false);
		}
	}
	function press(k: string) {
		setError(null);
		if (k === "⌫") setPin((p) => p.slice(0, -1));
		else if (k) setPin((p) => (p.length < 12 ? p + k : p));
	}

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (/^[0-9]$/.test(e.key)) press(e.key);
			else if (e.key === "Backspace") press("⌫");
			else if (e.key === "Enter") void submit();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	return (
		<main className={s.screen}>
			<img src="/icon.svg" alt="" className={s.logo} />
			<h1 className={s.title}>Enter the family PIN</h1>
			<div className={`${s.dots} ${error ? s.shake : ""}`} aria-label={`${pin.length} digits entered`}>
				{Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
					<span key={i} className={i < pin.length ? s.filled : undefined} />
				))}
			</div>
			<p className={s.error} role="alert">
				{error ?? " "}
			</p>
			<div className={s.pad}>
				{KEYS.map((k, i) =>
					k ? (
						<button key={i} className={k === "⌫" ? s.back : s.key} onClick={() => press(k)} aria-label={k === "⌫" ? "Delete" : k}>
							{k}
						</button>
					) : (
						<span key={i} />
					),
				)}
			</div>
			<button className={s.go} disabled={pin.length < 4 || busy} onClick={() => void submit()}>
				Sign in
			</button>
			<p className={s.hint}>This device stays signed in after this.</p>
		</main>
	);
}
