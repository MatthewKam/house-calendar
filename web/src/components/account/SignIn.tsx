import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type AuthStatus } from '../../lib/api';
import { appleSignIn, isApp } from '../../lib/native';
import { pendingJoin } from '../../lib/joinCode';
import JoinForm from './JoinForm';
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
	const done = useRef(onSignedIn);
	done.current = onSignedIn;

	useEffect(() => {
		const clientId = config?.google;
		if (!clientId) return;
		loadScript('https://accounts.google.com/gsi/client').then(
			() => {
				if (!window.google || !googleEl.current) return;
				window.google.accounts.id.initialize({
					client_id: clientId,
					callback: (r) => api.signInWith('google', r.credential).then(done.current, (e: Error) => setError(e.message)),
				});
				window.google.accounts.id.renderButton(googleEl.current, {
					theme: 'outline',
					size: 'large',
					shape: 'pill',
					text: 'continue_with',
					width: 320,
				});
			},
			() => setError("Couldn't load Google sign-in"),
		);
	}, [config?.google]);

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
				return onSignedIn(await api.signInWith('apple', r.idToken, r.name || undefined));
			}
			const r = await window.AppleID!.auth.signIn();
			// Apple gives the name only the first time someone signs in.
			const name = [r.user?.name?.firstName, r.user?.name?.lastName].filter(Boolean).join(' ');
			onSignedIn(await api.signInWith('apple', r.authorization.id_token, name || undefined));
		} catch (e) {
			// Closing Apple's pop-up (or the iPhone's sheet) isn't an error worth showing.
			const msg = e instanceof Error ? e.message : (e as { error?: string })?.error;
			if (msg && msg !== 'popup_closed_by_user' && (e as { code?: string })?.code !== 'canceled') setError(msg);
		}
	}

	return (
		<main className={s.screen}>
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
				{config?.google && <div ref={googleEl} className={s.google} />}
				{config?.email && <EmailSignIn onSignedIn={onSignedIn} />}
				{error && <p className={s.error}>{error}</p>}
				<div className={s.or}>or</div>
				{/* On the website: a made-up family to look around first (not in the App Store app). */}
				{config?.demo && !isApp && <TryDemo onSignedIn={onSignedIn} />}
				{showCode ? (
					<JoinForm signedIn={false} onJoined={onSignedIn} />
				) : (
					<Button variant="link" className={s.link} type="submit" onClick={() => setShowCode(true)}>
						Have a code? Set up a kid's device or the wall
					</Button>
				)}
				{!isApp && <GetTheApp />}
				{!isApp && <About />}
				<footer className={s.footer}>
					<a href="/privacy">Privacy</a> · <a href="/support">Support</a>
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
		<section className={s.about} aria-labelledby="about-sprig">
			<h2 id="about-sprig" className={s.subhead}>
				What Sprig does
			</h2>
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
		</section>
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
			<Button size="lg" block icon="👀" disabled={busy} onClick={() => void start()}>
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
					autoComplete="email"
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
				size="lg"
				block
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
