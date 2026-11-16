import { createRemoteJWKSet, jwtVerify } from 'jose';
import { codeEmail, type CodeFor } from './codeEmail.ts';

// Signing in with Google or Apple: the app (web page now, the phone app later) gets an ID token from
// Google's or Apple's own sign-in, and the server checks it was signed by them, for this app, and
// recently. Nobody's password ever reaches this server.

export interface Identity {
	/** Stable per person at that provider. */
	subject: string;
	/** Verified email, when the provider shares one (Apple may give a private relay address). */
	email: string | null;
	name: string | null;
}
export type VerifyToken = (idToken: string) => Promise<Identity>;

const GOOGLE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_KEYS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/** `clientIds`: every client of this app (web, iOS, Android); a token for any of them is accepted. */
export function googleVerifier(clientIds: string[]): VerifyToken {
	return async (idToken) => {
		const { payload } = await jwtVerify(idToken, GOOGLE_KEYS, {
			issuer: ['https://accounts.google.com', 'accounts.google.com'],
			audience: clientIds,
		});
		const email =
			payload.email_verified === true && typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
		return { subject: String(payload.sub), email, name: typeof payload.name === 'string' ? payload.name : null };
	};
}

/** `clientIds`: the web Services ID and the phone app's bundle id. Apple sends the name only the first time, to the page. */
export function appleVerifier(clientIds: string[]): VerifyToken {
	return async (idToken) => {
		const { payload } = await jwtVerify(idToken, APPLE_KEYS, {
			issuer: 'https://appleid.apple.com',
			audience: clientIds,
		});
		const verified = payload.email_verified === true || payload.email_verified === 'true';
		const email = verified && typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
		return { subject: String(payload.sub), email, name: null };
	};
}

/** Sends a code: to sign in, or (purpose "pin") to set a new PIN. */
export type SendCode = (email: string, code: string, purpose?: CodeFor) => Promise<void>;

/**
 * Through Resend (resend.com), from `from` (e.g. "Sprig <signin@yourdomain.com>"), as codeEmail.ts writes
 * it; `site` is where Sprig is, for its picture and links.
 */
export function resendSender(apiKey: string, from: string, site: string): SendCode {
	return async (email, code, purpose = 'sign-in') => {
		const { subject, html, text } = codeEmail(code, purpose, site);
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				from,
				to: email,
				subject,
				html,
				text,
			}),
		});
		if (!res.ok) throw new Error(`Email failed: ${res.status} ${await res.text()}`);
	};
}
