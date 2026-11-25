import {
	browserSupportsWebAuthn,
	browserSupportsWebAuthnAutofill,
	platformAuthenticatorIsAvailable,
	startAuthentication,
	startRegistration,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api, type AuthStatus, type Passkey } from './api';
import { isApp } from './native';

// Passkeys on the website: Face ID, Touch ID or the screen lock instead of an emailed code
// (server/hosted/passkeys.ts). Not in the phone app yet: that needs a new App Store version.
//
// Safari only shows its passkey sheet straight from a tap, so the server's one-time options are fetched
// ahead (prepare…), and the tap goes straight to the device.

/** This browser can use passkeys (and this isn't the phone app). */
export const passkeysWork = () => !isApp && browserSupportsWebAuthn();

/** This device has Face ID, Touch ID, Windows Hello or a screen lock to keep one with. */
export const deviceKeepsPasskeys = () =>
	passkeysWork() ? platformAuthenticatorIsAvailable().catch(() => false) : Promise.resolve(false);

/** Changing your mind (closing the sheet, a timeout) isn't a problem to show. */
export const notChosen = (err: unknown) =>
	err instanceof Error &&
	(err.name === 'NotAllowedError' ||
		err.name === 'AbortError' ||
		/ABORTED/.test((err as { code?: string }).code ?? ''));

/** Saving one: options fetched first, then `save()` from the tap. */
export async function prepareSave() {
	const optionsJSON: PublicKeyCredentialCreationOptionsJSON = await api.passkeySaveOptions();
	return async (): Promise<Passkey> => api.passkeySave(await startRegistration({ optionsJSON }));
}

/** Signing in with one: options fetched first, then `signIn()` from the tap. */
export async function prepareSignIn() {
	const { id, options } = await api.passkeySignInOptions();
	return async (): Promise<AuthStatus> => api.passkeySignIn(id, await startAuthentication({ optionsJSON: options }));
}

/**
 * The device offers saved passkeys as you tap the email box (where it can). Resolves when one is
 * picked and checked; rejects when another sign-in starts (that one ends this) or it isn't offered.
 */
export async function signInFromAutofill(): Promise<AuthStatus> {
	if (!passkeysWork() || !(await browserSupportsWebAuthnAutofill())) throw new Error('No autofill');
	const { id, options }: { id: string; options: PublicKeyCredentialRequestOptionsJSON } =
		await api.passkeySignInOptions();
	return api.passkeySignIn(id, await startAuthentication({ optionsJSON: options, useBrowserAutofill: true }));
}

const OFFER = 'sprig:offer-passkey';
/** Just signed in another way (a code, Apple, Google): offer to save a passkey once the app opens. */
export function offerPasskeyNext() {
	try {
		sessionStorage.setItem(OFFER, '1');
	} catch {
		/* private browsing: no offer */
	}
}
/** Whether to offer one now (once: asking clears it). */
export function takePasskeyOffer() {
	try {
		const due = sessionStorage.getItem(OFFER) === '1';
		sessionStorage.removeItem(OFFER);
		return due;
	} catch {
		return false;
	}
}
