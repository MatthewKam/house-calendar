import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AuthStatus } from "../lib/api";
import { pendingJoin } from "../lib/joinCode";
import JoinForm from "./JoinForm";
import s from "../styles/Account.module.css";

// Google's and Apple's own sign-in buttons give the page an ID token, which the server checks.
declare global {
	interface Window {
		google?: { accounts: { id: {
			initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
			renderButton(el: HTMLElement, o: Record<string, unknown>): void;
		} } };
		AppleID?: { auth: {
			init(o: Record<string, unknown>): void;
			signIn(): Promise<{ authorization: { id_token: string }; user?: { name?: { firstName?: string; lastName?: string } } }>;
		} };
	}
}

function loadScript(src: string) {
	return new Promise<void>((resolve, reject) => {
		if (document.querySelector(`script[src="${src}"]`)) return resolve();
		const el = Object.assign(document.createElement("script"), { src, async: true, onload: () => resolve(), onerror: reject });
		document.head.append(el);
	});
}

/**
 * The first screen on a device that isn't signed in: sign in with Apple, Google or an emailed code,
 * or join with a code (a kid's device, or the wall) without an account.
 */
export default function SignIn({ onSignedIn }: { onSignedIn: (s: AuthStatus) => void }) {
	const config = useQuery({ queryKey: ["account-config"], queryFn: api.accountConfig, staleTime: Infinity }).data;
	const [error, setError] = useState<string | null>(null);
	// An invite link for a kid's device or the wall goes straight to the code.
	const [showCode, setShowCode] = useState(!!pendingJoin());
	const googleEl = useRef<HTMLDivElement>(null);
	const done = useRef(onSignedIn);
	done.current = onSignedIn;

	useEffect(() => {
		const clientId = config?.google;
		if (!clientId) return;
		loadScript("https://accounts.google.com/gsi/client").then(() => {
			if (!window.google || !googleEl.current) return;
			window.google.accounts.id.initialize({
				client_id: clientId,
				callback: (r) => api.signInWith("google", r.credential).then(done.current, (e: Error) => setError(e.message)),
			});
			window.google.accounts.id.renderButton(googleEl.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 320 });
		}, () => setError("Couldn't load Google sign-in"));
	}, [config?.google]);

	useEffect(() => {
		const clientId = config?.apple;
		if (!clientId) return;
		loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js").then(() =>
			window.AppleID?.auth.init({ clientId, scope: "name email", redirectURI: `${location.origin}/`, usePopup: true }),
		);
	}, [config?.apple]);

	async function apple() {
		setError(null);
		try {
			const r = await window.AppleID!.auth.signIn();
			// Apple gives the name only the first time someone signs in.
			const name = [r.user?.name?.firstName, r.user?.name?.lastName].filter(Boolean).join(" ");
			onSignedIn(await api.signInWith("apple", r.authorization.id_token, name || undefined));
		} catch (e) {
			// Closing Apple's pop-up isn't an error worth showing.
			const msg = e instanceof Error ? e.message : (e as { error?: string })?.error;
			if (msg && msg !== "popup_closed_by_user") setError(msg);
		}
	}

	return (
		<main className={s.screen}>
			<div className={s.column}>
				<img src="/icon.svg" alt="" className={s.logo} />
				<h1 className={s.title}>Welcome</h1>
				<p className={s.lead}>Your family's calendar, tasks and rewards, on everyone's phone and the wall.</p>
				{config?.apple && (
					<button className={s.apple} onClick={() => void apple()}>
						 Continue with Apple
					</button>
				)}
				{config?.google && <div ref={googleEl} className={s.google} />}
				{config?.email && <EmailSignIn onSignedIn={onSignedIn} />}
				{error && <p className={s.error}>{error}</p>}
				<div className={s.or}>or</div>
				{showCode ? (
					<JoinForm signedIn={false} onJoined={onSignedIn} />
				) : (
					<button className={s.link} onClick={() => setShowCode(true)}>
						Have a code? Set up a kid's device or the wall
					</button>
				)}
			</div>
		</main>
	);
}

/** Sign in with a 6-digit code sent by email. */
function EmailSignIn({ onSignedIn }: { onSignedIn: (s: AuthStatus) => void }) {
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			if (!sent) {
				await api.emailCode(email.trim());
				setSent(true);
			} else {
				onSignedIn(await api.verifyEmail(email.trim(), code));
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className={s.card} onSubmit={submit}>
			{!sent ? (
				<input className={s.input} type="email" autoComplete="email" placeholder="Email" aria-label="Email" value={email}
					onChange={(e) => setEmail(e.target.value)} />
			) : (
				<>
					<p className={s.hint}>We sent a code to {email}.</p>
					<input className={s.code} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="Code"
						value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} autoFocus />
				</>
			)}
			{error && <p className={s.error}>{error}</p>}
			<button className={s.primary} disabled={busy || (sent ? code.length !== 6 : !/\S+@\S+\.\S+/.test(email))}>
				{sent ? "Sign in" : "Email me a code"}
			</button>
			{sent && (
				<button type="button" className={s.link} onClick={() => { setSent(false); setCode(""); }}>
					Use a different email
				</button>
			)}
		</form>
	);
}
