import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type AuthStatus } from '../../lib/api';
import { appleSignIn, isApp, SITE_PAGE } from '../../lib/native';
import { pendingJoin } from '../../lib/joinCode';
import { notChosen, offerPasskeyNext, passkeysWork, prepareSignIn, signInFromAutofill } from '../../lib/passkeys';
import JoinForm from './JoinForm';
import { tapArea } from '../../lib/haptics';
import s from './styles/Account.module.css';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';

// Google's and Apple's own sign-in buttons give the page an ID token, which the server checks.
declare global {
	interface Window {
		google?: {
			accounts: {
				id: {
					initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
					renderButton(el: HTMLElement, o: Record<string, unknown>): void;
				};
				oauth2: {
					initCodeClient(o: {
						client_id: string;
						scope: string;
						ux_mode: 'popup';
						callback: (r: { code?: string; error?: string }) => void;
						error_callback?: (e: { type: string }) => void;
					}): { requestCode(): void };
				};
			};
		};
		AppleID?: {
			auth: {
				init(o: Record<string, unknown>): void;
				signIn(): Promise<{
					authorization: { id_token: string };
					user?: { name?: { firstName?: string; lastName?: string } };
				}>;
			};
		};
	}
}

function loadScript(src: string) {
	return new Promise<void>((resolve, reject) => {
		if (document.querySelector(`script[src="${src}"]`)) return resolve();
		const el = Object.assign(document.createElement('script'), {
			src,
			async: true,
			onload: () => resolve(),
			onerror: reject,
		});
		document.head.append(el);
	});
}

/**
 * The first screen on a device that isn't signed in: sign in with Apple, Google or an emailed code,
 * or join with a code (a kid's device, or the wall) without an account.
 */
export default function SignIn({ onSignedIn }: { onSignedIn: (s: AuthStatus) => void }) {
	const config = useQuery({ queryKey: ['account-config'], queryFn: api.accountConfig, staleTime: Infinity }).data;
	const [error, setError] = useState<string | null>(null);
	// An invite link for a kid's device or the wall goes straight to the code.
	const [showCode, setShowCode] = useState(!!pendingJoin());
	const googleEl = useRef<HTMLDivElement>(null);
	// Sprig's own Google button opens Google's sign-in window with this (made once Google's script is in).
	const googleCode = useRef<{ requestCode(): void } | null>(null);
	// Signed in with a code, Apple or Google: the app offers a passkey for next time (PasskeyOffer).
	const signedIn = (st: AuthStatus) => {
		offerPasskeyNext();
		onSignedIn(st);
	};
	const done = useRef(signedIn);
	done.current = signedIn;
	// Signing in with a passkey: ready before the tap (Safari only shows its sheet straight from one).
	const passkeyReady = useRef<(() => Promise<AuthStatus>) | null>(null);
	const passkeyOn = !!config?.passkeys && passkeysWork();
	useEffect(() => {
		if (!passkeyOn) return;
		let live = true;
		const ready = () =>
			prepareSignIn().then(
				(go) => void (live && (passkeyReady.current = go)),
				() => {},
			);
		void ready();
		// Refreshed before the server's one-time challenge runs out (5 minutes).
		const t = setInterval(ready, 4 * 60_000);
		// And the device may offer its passkeys as the email box is tapped.
		signInFromAutofill().then(
			(st) => live && onSignedIn(st),
			() => {},
		);
		return () => {
			live = false;
			clearInterval(t);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [passkeyOn]);

	function passkey() {
		setError(null);
		const go = passkeyReady.current;
		if (!go) return setError('Passkeys are still getting ready. Try again in a moment.');
		passkeyReady.current = null;
		go()
			.then(onSignedIn, (e: Error) => !notChosen(e) && setError(e.message))
			.finally(() =>
				prepareSignIn().then(
					(g) => (passkeyReady.current = g),
					() => {},
				),
			);
	}

	useEffect(() => {
		const clientId = config?.google;
		if (!clientId) return;
		loadScript('https://accounts.google.com/gsi/client').then(
			() => {
				if (!window.google) return;
				if (config?.googleButton) {
					googleCode.current = window.google.accounts.oauth2.initCodeClient({
						client_id: clientId,
						scope: 'openid email profile',
						ux_mode: 'popup',
						callback: (r) => {
							if (!r.code)
								return setError(r.error === 'access_denied' ? null : "Google sign-in didn't work. Try again.");
							api.signInWithGoogleCode(r.code).then(done.current, (e: Error) => setError(e.message));
						},
						// Closing Google's window is just changing your mind.
						error_callback: () => {},
					});
					return;
				}
				if (!googleEl.current) return;
				window.google.accounts.id.initialize({
					client_id: clientId,
					callback: (r) => api.signInWith('google', r.credential).then(done.current, (e: Error) => setError(e.message)),
				});
				// Google's own button, as wide as Apple's (Google allows 200 to 400 pixels), and its black one
				// in dark mode so it doesn't glare.
				const dark = document.documentElement.dataset.theme === 'dark';
				window.google.accounts.id.renderButton(googleEl.current, {
					theme: dark ? 'filled_black' : 'outline',
					size: 'large',
					shape: 'pill',
					text: 'continue_with',
					width: Math.max(200, Math.min(400, Math.round(googleEl.current.clientWidth))),
				});
			},
			() => setError("Couldn't load Google sign-in"),
		);
	}, [config?.google, config?.googleButton]);

	useEffect(() => {
		const clientId = config?.apple;
		if (!clientId || isApp) return;
		loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js').then(() =>
			window.AppleID?.auth.init({ clientId, scope: 'name email', redirectURI: `${location.origin}/`, usePopup: true }),
		);
	}, [config?.apple]);

	async function apple() {
		setError(null);
		try {
			if (isApp) {
				const r = await appleSignIn();
				return signedIn(await api.signInWith('apple', r.idToken, r.name || undefined));
			}
			const r = await window.AppleID!.auth.signIn();
			// Apple gives the name only the first time someone signs in.
			const name = [r.user?.name?.firstName, r.user?.name?.lastName].filter(Boolean).join(' ');
			signedIn(await api.signInWith('apple', r.authorization.id_token, name || undefined));
		} catch (e) {
			// Closing Apple's pop-up (or the iPhone's sheet) isn't an error worth showing.
			const msg = e instanceof Error ? e.message : (e as { error?: string })?.error;
			if (msg && msg !== 'popup_closed_by_user' && (e as { code?: string })?.code !== 'canceled') setError(msg);
		}
	}

	return (
		<main className={s.screen} {...tapArea}>
			<div className={s.column}>
				<img src="/wordmark.svg" alt="Sprig" className={s.wordmark} />
				<h1 className={s.title}>Welcome</h1>
				<p className={s.lead}>
					Your family's calendar, tasks and rewards, on everyone's phone and the wall. Bring in your Google or iCloud
					calendars and everyone's events are in one place.
				</p>
				{config?.apple && (
					<button className={s.apple} onClick={() => void apple()}>
						Continue with Apple
					</button>
				)}
				{config?.google &&
					(config.googleButton ? (
						<button
							type="button"
							className={s.googleButton}
							onClick={() => {
								setError(null);
								if (googleCode.current) googleCode.current.requestCode();
								else setError('Google sign-in is still loading. Try again in a moment.');
							}}
						>
							<span className={s.googleMark} aria-hidden="true">
								<GoogleG />
							</span>
							<span>Continue with Google</span>
						</button>
					) : (
						<div ref={googleEl} className={s.google} />
					))}
				{passkeyOn && (
					<Button block icon="🔑" className={s.rounded} onClick={passkey}>
						Sign in with a passkey
					</Button>
				)}
				{config?.email && <EmailSignIn onSignedIn={signedIn} />}
				{error && <p className={s.error}>{error}</p>}
				<div className={s.or}>or</div>
				{/* On the website: a made-up family to look around first (not in the App Store app). */}
				{config?.demo && !isApp && <TryDemo onSignedIn={onSignedIn} />}
				{showCode ? (
					<JoinForm signedIn={false} onJoined={onSignedIn} />
				) : (
					<Button variant="link" className={s.link} type="submit" onClick={() => setShowCode(true)}>
						Have a code? <span>Set up a kid's device or the wall</span>
					</Button>
				)}
				{!isApp && <GetTheApp />}
				{!isApp && <About />}
				<footer className={s.footer}>
					{/* A new tab (in the app, a Safari sheet): the pages are the site's, not the app's. */}
					<a href={SITE_PAGE('/privacy')} target="_blank" rel="noopener noreferrer">
						Privacy
					</a>{' '}
					·{' '}
					<a href={SITE_PAGE('/support')} target="_blank" rel="noopener noreferrer">
						Support
					</a>
				</footer>
			</div>
		</main>
	);
}

/**
 * What Sprig is, for someone arriving at the website signed out (Google's and Apple's reviewers among
 * them): what it does, and why it asks for calendar access.
 */
function About() {
	return (
		// Folded until opened, so the sign-in stays the first thing on screen (Settings' fold, chevron and all).
		<details className={s.about}>
			<summary className={s.aboutHead}>What Sprig does</summary>
			<ul>
				<li>
					<b>One family calendar</b> on everyone's phone and a screen at home. Connect Google Calendar or iCloud and
					everyone's events show in one place; an event added or changed in Sprig goes back to that calendar.
				</li>
				<li>
					<b>Kids' tasks, stars and rewards,</b> made for little ones: pictures over words, big buttons, nothing to
					fail.
				</li>
				<li>
					<b>Shared lists, meals and recipes</b> for the whole family.
				</li>
				<li>
					<b>No ads, ever.</b> Your family's information is never sold or used to track you.
				</li>
			</ul>
		</details>
	);
}

/** Google's "G", in its own colours (Google's sign-in button rules ask for it as is). */
function GoogleG() {
	return (
		<svg viewBox="0 0 48 48">
			<path
				fill="#EA4335"
				d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
			/>
			<path
				fill="#4285F4"
				d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
			/>
			<path
				fill="#FBBC05"
				d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
			/>
			<path
				fill="#34A853"
				d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
			/>
		</svg>
	);
}

/** Sprig in the App Store (its Apple ID in App Store Connect). */
const APP_STORE = 'https://apps.apple.com/app/id6835357587';

/**
 * The website's way to the App Store app: Apple's badge on an iPhone or iPad, and on a computer the badge
 * with a QR code to scan with the phone. Not on Android, or inside the app.
 */
export function GetTheApp() {
	const ua = navigator.userAgent;
	if (/Android/i.test(ua)) return null;
	// iPadOS asks for the desktop site, so it says Macintosh; it's the one with a touch screen.
	const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	return (
		<div className={s.getApp}>
			<a href={APP_STORE} target="_blank" rel="noopener noreferrer">
				<img src="/app-store-badge.svg" alt="Download on the App Store" className={s.badge} />
			</a>
			{!apple && (
				<>
					<img src="/app-store-qr.svg" alt="" className={s.qr} />
					<p className={s.hint}>Or scan with your iPhone's camera.</p>
				</>
			)}
		</div>
	);
}

/** The site's demo: the visitor's own copy of a made-up family, no email needed (server/hosted/demo.ts). */
function TryDemo({ onSignedIn }: { onSignedIn: (s: AuthStatus) => void }) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function start() {
		setBusy(true);
		setError(null);
		try {
			onSignedIn(await api.startDemo());
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setBusy(false);
		}
	}

	return (
		<div className={s.card}>
			<Button block icon="👀" className={s.rounded} disabled={busy} onClick={() => void start()}>
				{busy ? 'Making your demo family…' : 'Try the demo'}
			</Button>
			<p className={s.hint}>Look around a made-up family's week. No email needed; it's deleted after a day.</p>
			{error && <p className={s.error}>{error}</p>}
		</div>
	);
}

/** Sign in with a 6-digit code sent by email. */
function EmailSignIn({ onSignedIn }: { onSignedIn: (s: AuthStatus) => void }) {
	const [email, setEmail] = useState('');
	const [sent, setSent] = useState(false);
	const [code, setCode] = useState('');
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
				<Input
					type="email"
					autoComplete="username webauthn"
					placeholder="Email"
					aria-label="Email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			) : (
				<>
					<p className={s.hint}>We sent a code to {email}.</p>
					<Input
						className={s.code}
						inputMode="numeric"
						autoComplete="one-time-code"
						placeholder="123456"
						aria-label="Code"
						value={code}
						onChange={(e) => setCode(e.target.value)}
						maxLength={6}
						autoFocus
					/>
				</>
			)}
			{error && <p className={s.error}>{error}</p>}
			<Button
				variant="primary"
				block
				className={s.rounded}
				type="submit"
				disabled={busy || (sent ? code.length !== 6 : !/\S+@\S+\.\S+/.test(email))}
			>
				{sent ? 'Sign in' : 'Email me a code'}
			</Button>
			{sent && (
				<Button
					variant="link"
					className={s.link}

					onClick={() => {
						setSent(false);
						setCode('');
					}}
				>
					Use a different email
				</Button>
			)}
		</form>
	);
}
