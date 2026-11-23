import { Capacitor, registerPlugin } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Browser } from '@capacitor/browser';
import { PushNotifications } from '@capacitor/push-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';

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

/** Signed out, or the account deleted: the token is no use any more, and the phone stops sending calendars. */
export function forgetSession() {
	if (!isApp || !session) return;
	session = null;
	void SecureStorage.remove(KEY).catch(() => {});
	void PhoneCalendars.stop().catch(() => {});
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

/** Opens a web page over the app in a Safari sheet, with a Done button. */
export const openInSheet = (url: string) => Browser.open({ url });

/** When the sheet's Done is tapped. Returns how to stop listening. */
export function onSheetClosed(then: () => void) {
	const listening = Browser.addListener('browserFinished', then);
	return () => void listening.then((l) => l.remove());
}

/** In the app, links that open a new tab (a recipe's page, say) open in a Safari sheet instead. */
export function linksInSheet() {
	if (!isApp) return;
	document.addEventListener('click', (e) => {
		const a = (e.target as Element | null)?.closest?.('a[target="_blank"]');
		if (!(a instanceof HTMLAnchorElement) || !/^https?:/.test(a.href)) return;
		e.preventDefault();
		void openInSheet(a.href);
	});
}

/** The clock and battery over the page: dark on a light page, light on a dark one (Sprig's own pick). */
export function statusBarFor(mode: 'light' | 'dark') {
	if (isApp) void StatusBar.setStyle({ style: mode === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
}

// Alerts in the app: Apple's own (server/apns.ts), as web alerts can't work inside an app. Apple gives the
// app a device token once it's allowed; whether it's a build run from Xcode (Apple's sandbox) comes from
// the app itself (ios/App/App/Alerts.swift).
const AppAlerts = registerPlugin<{ environment(): Promise<{ sandbox: boolean }> }>('AppAlerts');

/** Whether the iPhone lets Sprig show alerts: yes, no (changed in its Settings), or not asked yet. */
export async function appAlertsAllowed(): Promise<'granted' | 'denied' | 'prompt'> {
	const { receive } = await PushNotifications.checkPermissions();
	return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
}

/** Asks the iPhone (the first time, its "Allow notifications?"); then 'granted' or not. */
export async function askAppAlerts() {
	const { receive } = await PushNotifications.requestPermissions();
	return receive;
}

/** This phone's address with Apple, once alerts are allowed. */
export async function appleDevice(): Promise<{ token: string; sandbox: boolean }> {
	const token = new Promise<string>((resolve, reject) => {
		const done = Promise.all([
			PushNotifications.addListener('registration', (t) => {
				void done.then((ls) => ls.forEach((l) => void l.remove()));
				resolve(t.value);
			}),
			PushNotifications.addListener('registrationError', (e) => {
				void done.then((ls) => ls.forEach((l) => void l.remove()));
				reject(new Error(e.error || "Apple didn't give this phone an alert address"));
			}),
		]);
		void done.then(() => PushNotifications.register());
	});
	const [value, { sandbox }] = await Promise.all([token, AppAlerts.environment()]);
	return { token: value, sandbox };
}

/** A tapped alert opens what it's about (its page, as the server's `url` says: '/#lists'). */
export function openTappedAlerts() {
	if (!isApp) return;
	void PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
		const url = (notification.data as { url?: unknown } | undefined)?.url;
		if (typeof url === 'string' && url.startsWith('/#')) location.hash = url.slice(1);
	});
}

// The phone's own calendars, shared without a password (ios/App/App/PhoneCalendars.swift, which sends them
// itself: when Sprig opens, and in the background when iOS allows).
export interface PhoneCalendarChoice {
	id: string;
	name: string;
	/** The account it's in: "iCloud", "Gmail". */
	account: string;
	/** The phone's default calendar for new events. */
	primary: boolean;
}
const PhoneCalendars = registerPlugin<{
	access(): Promise<{ access: 'granted' | 'denied' | 'prompt' }>;
	requestAccess(): Promise<{ granted: boolean }>;
	calendars(): Promise<{ calendars: PhoneCalendarChoice[] }>;
	share(o: {
		server: string;
		phone: string;
		name: string;
		token: string;
		calendarIds: string[];
	}): Promise<{ events: number }>;
	shared(): Promise<{ phone?: string; calendarIds?: string[] }>;
	syncNow(o: { token?: string }): Promise<{ events: number }>;
	stop(): Promise<void>;
}>('PhoneCalendars');

/** Whether Sprig may read this phone's calendars: yes, no (changed in its Settings), or not asked yet. */
export const phoneCalendarAccess = async () => (await PhoneCalendars.access()).access;
/** Asks (the first time, the iPhone's "Allow access to your calendars?"); true when allowed. */
export const askPhoneCalendars = async () => (await PhoneCalendars.requestAccess()).granted;
/** The phone's calendars, to pick which to share. */
export const phoneCalendarList = async () => (await PhoneCalendars.calendars()).calendars;
/** What this phone shares now: its id with Sprig and the calendars picked, or null. */
export async function phoneCalendarsShared() {
	const s = await PhoneCalendars.shared();
	return s.phone ? { phone: s.phone, calendarIds: s.calendarIds ?? [] } : null;
}

/** Starts (or changes) sharing these calendars from this phone, and sends them now; how many events went. */
export async function sharePhoneCalendars(calendarIds: string[], name: string) {
	const phone = (await phoneCalendarsShared())?.phone ?? crypto.randomUUID();
	const { events } = await PhoneCalendars.share({
		server: SERVER,
		phone,
		name,
		token: session?.token ?? '',
		calendarIds,
	});
	return { phone, events };
}

/** Sends the shared calendars again (Sprig opened); nothing when none are shared. */
export async function syncPhoneCalendars() {
	if (!isApp || !(await phoneCalendarsShared())) return;
	await PhoneCalendars.syncNow({ token: session?.token });
}

/** Stops sharing from this phone. */
export const stopPhoneCalendars = () => PhoneCalendars.stop();

// A grown-up's PIN kept on their own iPhone or iPad behind Face ID (ios/App/App/FaceIdPin.swift), so the PIN
// sheets can ask for a face instead (useFaceIdPin.ts). The server still checks the PIN.
export type Biometry = 'faceID' | 'touchID' | 'none';
const FaceIdPin = registerPlugin<{
	kind(): Promise<{ kind: Biometry; ready: boolean; why?: string }>;
	has(o: { account: string }): Promise<{ has: boolean }>;
	save(o: { account: string; pin: string }): Promise<void>;
	read(o: { account: string; reason: string }): Promise<{ pin: string }>;
	remove(o: { account: string }): Promise<void>;
}>('FaceIdPin');

/** Face ID, Touch ID or none on this device (none on the website), and whether it's set up and allowed. */
export async function biometry(): Promise<{ kind: Biometry; ready: boolean; why?: string }> {
	if (!isApp) return { kind: 'none', ready: false };
	try {
		return await FaceIdPin.kind();
	} catch {
		return { kind: 'none', ready: false };
	}
}
/** What to call it: "Face ID" or "Touch ID". */
export const biometryName = (kind: Biometry) => (kind === 'touchID' ? 'Touch ID' : 'Face ID');
/** One saved PIN per grown-up signed in on this device. */
const pinAccount = (memberId: string) => `pin.${memberId}`;
export const hasFacePin = async (memberId: string) => (await FaceIdPin.has({ account: pinAccount(memberId) })).has;
export const saveFacePin = (memberId: string, pin: string) => FaceIdPin.save({ account: pinAccount(memberId), pin });
export const forgetFacePin = (memberId: string) => FaceIdPin.remove({ account: pinAccount(memberId) });
/** The saved PIN after Face ID; throws (code "canceled" or "missing") when there's none to give. */
export const readFacePin = async (memberId: string, reason: string) =>
	(await FaceIdPin.read({ account: pinAccount(memberId), reason })).pin;
