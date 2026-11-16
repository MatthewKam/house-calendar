import { Capacitor, registerPlugin } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

// The phone app (Capacitor): the same pages, shipped inside the app, calling sprig-family.com. It's
// another origin, so instead of the cookie it keeps its session token in the iPhone's Keychain and sends
// it with each call; pictures, videos and sounds (shown by address) carry a media key instead
// (server/hosted/session.ts). On the web, all of this does nothing.

export const isApp = Capacitor.isNativePlatform();

/** Where the app's calls go: sprig-family.com, or VITE_APP_SERVER (a Mac's address while developing). */
export const SERVER = isApp ? import.meta.env.VITE_APP_SERVER || 'https://sprig-family.com' : '';

const KEY = 'session';
let session: { token: string; media: string } | null = null;

/** Reads the kept session before the app starts (it's asked for synchronously from then on). */
export async function loadSession() {
	if (!isApp) return;
	try {
		session = (await SecureStorage.get(KEY)) as typeof session;
	} catch {
		session = null;
	}
}

/** A sign-in's reply: the new token and media key, when it gave them (the server only does for the app). */
export function keepSession(res: { headers: { get(name: string): string | null } } | XMLHttpRequest) {
	const get = (name: string) => ('getResponseHeader' in res ? res.getResponseHeader(name) : res.headers.get(name));
	const token = get('x-session-token');
	const media = get('x-media-key');
	if (!isApp || !token || !media) return;
	session = { token, media };
	void SecureStorage.set(KEY, session).catch(() => {});
}

/** Signed out, or the account deleted: the token is no use any more. */
export function forgetSession() {
	if (!isApp || !session) return;
	session = null;
	void SecureStorage.remove(KEY).catch(() => {});
}

/** The headers that say who's calling: the token in the app, nothing on the web (the cookie does it). */
export const authHeaders = (): Record<string, string> => (session ? { authorization: `Bearer ${session.token}` } : {});

/** A picture's, video's or sound's address from the server, as the app can open it. */
export function mediaUrl(url: string): string;
export function mediaUrl(url: string | null): string | null;
export function mediaUrl(url: string | null) {
	if (!url || !isApp || !url.startsWith('/api/')) return url;
	return `${SERVER}${url}${url.includes('?') ? '&' : '?'}media=${encodeURIComponent(session?.media ?? '')}`;
}

// Sign in with Apple through the iPhone's own sheet (ios/App/App/SignInWithApple.swift): the web pop-up
// doesn't work inside an app. Closing the sheet rejects with code 'canceled'.
const SignInWithApple = registerPlugin<{ signIn(): Promise<{ idToken: string; name: string }> }>('SignInWithApple');
export const appleSignIn = () => SignInWithApple.signIn();
