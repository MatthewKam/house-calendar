import { useState, type FormEvent } from "react";
import { api, type AuthStatus, type SignedIn } from "../lib/api";
import JoinForm from "./JoinForm";
import s from "../styles/Account.module.css";

/** Signed in, but in no household yet: start one (as its first guardian), or join one with a code. */
export default function Welcome({ status, onDone }: { status: SignedIn; onDone: (s: AuthStatus) => void }) {
	const [name, setName] = useState("");
	const [yourName, setYourName] = useState(status.user?.name ?? "");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function create(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			onDone(await api.createHousehold({ name: name.trim(), yourName: yourName.trim() }));
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className={s.screen}>
			<div className={s.column}>
				<img src="/icon.svg" alt="" className={s.logo} />
				<h1 className={s.title}>Hi{status.user?.name ? `, ${status.user.name.split(" ")[0]}` : ""}</h1>
				<p className={s.lead}>Join your family's household with the code they sent you, or start a new one.</p>
				<JoinForm signedIn onJoined={onDone} />
				<div className={s.or}>or</div>
				<form className={s.card} onSubmit={create}>
					<h2>Start a household</h2>
					<input className={s.input} placeholder="Household name, e.g. The Kims" aria-label="Household name" value={name}
						onChange={(e) => setName(e.target.value)} maxLength={40} />
					<input className={s.input} placeholder="Your name" aria-label="Your name" value={yourName}
						onChange={(e) => setYourName(e.target.value)} maxLength={40} />
					<p className={s.hint}>You'll be its guardian, and can invite another guardian and add the kids next.</p>
					{error && <p className={s.error}>{error}</p>}
					<button className={s.primary} disabled={busy || !name.trim() || !yourName.trim()}>
						Start
					</button>
				</form>
				<button className={s.link} onClick={() => void api.signOut().then(() => onDone({ signedIn: false }))}>
					Sign out{status.user?.email ? ` (${status.user.email})` : ""}
				</button>
			</div>
		</main>
	);
}
