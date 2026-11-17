import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { appAlertsAllowed, appleDevice, askAppAlerts, isApp } from './native';
import { appleEndpoint } from '../../../shared/push.ts';

/**
 * Alerts on this device (server/push.ts): what the switch in Settings shows.
 * - on / off: they can be turned on or off here.
 * - home-screen: an iPhone or iPad in Safari; alerts need Sprig added to the Home Screen first.
 * - blocked: the browser (or the iPhone, for the app) was told no; it's allowed again in its settings.
 * - unsupported: this browser can't (or the server has alerts off).
 * - app: the phone app, while the server can't send to it yet (no Apple push key).
 */
export type PushState = 'loading' | 'on' | 'off' | 'home-screen' | 'blocked' | 'unsupported' | 'app';

const IOS =
	/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE =
	window.matchMedia('(display-mode: standalone)').matches ||
	(navigator as { standalone?: boolean }).standalone === true;

/** The server's key, as the browser wants it. */
function keyBytes(base64url: string) {
	const raw = atob(
		base64url
			.replace(/-/g, '+')
			.replace(/_/g, '/')
			.padEnd(Math.ceil(base64url.length / 4) * 4, '='),
	);
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function registration() {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
	// Only the built app registers the service worker (main.tsx).
	return (await navigator.serviceWorker.getRegistration()) ?? null;
}

// In the app, the iPhone's permission stays once given, so turning alerts off in Sprig is remembered here.
const APP_OFF = 'sprig:app-alerts-off';
const appOff = {
	get: () => {
		try {
			return localStorage.getItem(APP_OFF) === '1';
		} catch {
			return false;
		}
	},
	set: (off: boolean) => {
		try {
			if (off) localStorage.setItem(APP_OFF, '1');
			else localStorage.removeItem(APP_OFF);
		} catch {
			// Not kept: alerts come back on next time the app opens, as the iPhone still allows them.
		}
	},
};

/** In the app: tells the server this phone's Apple address, and gives its name there. */
async function appOn() {
	const device = await appleDevice();
	await api.pushOnApple(device, zone());
	return appleEndpoint(device.token);
}

async function current(): Promise<PushState> {
	if (isApp) {
		if (!(await api.pushKey()).apple) return 'app';
		const allowed = await appAlertsAllowed();
		if (allowed === 'denied') return 'blocked';
		if (allowed === 'prompt' || appOff.get()) return 'off';
		// Tell the server again: it may have forgotten this phone, or the time zone moved with a trip.
		await appOn().catch(() => {});
		return 'on';
	}
	if (!('Notification' in window) || !('PushManager' in window))
		return IOS && !STANDALONE ? 'home-screen' : 'unsupported';
	if (Notification.permission === 'denied') return 'blocked';
	const reg = await registration();
	if (!reg) return 'unsupported';
	const sub = await reg.pushManager.getSubscription();
	if (!sub) return 'off';
	await api.pushOn(sub.toJSON(), zone()).catch(() => {});
	return 'on';
}

/** This device's name on the server: the browser's endpoint, or the app's Apple token. */
async function endpoint() {
	if (isApp) return appleEndpoint((await appleDevice()).token);
	return (await (await registration())?.pushManager.getSubscription())?.endpoint ?? null;
}

export function usePush() {
	const [state, setState] = useState<PushState>('loading');
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [tested, setTested] = useState(false);

	useEffect(() => {
		let live = true;
		current().then(
			(s) => live && setState(s),
			() => live && setState('unsupported'),
		);
		return () => {
			live = false;
		};
	}, []);

	const turnOn = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			if (isApp) {
				// The iPhone asks "Allow notifications?" the first time.
				const permission = await askAppAlerts();
				if (permission !== 'granted') return setState(permission === 'denied' ? 'blocked' : 'off');
				await appOn();
				appOff.set(false);
				return setState('on');
			}
			const reg = await registration();
			if (!reg) return setState('unsupported');
			// Asked from the tap, as Safari requires.
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') return setState(permission === 'denied' ? 'blocked' : 'off');
			const { publicKey } = await api.pushKey();
			const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
			await api.pushOn(sub.toJSON(), zone());
			setState('on');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Alerts could not be turned on');
		} finally {
			setBusy(false);
		}
	}, []);

	const turnOff = useCallback(async () => {
		setBusy(true);
		setError(null);
		setTested(false);
		try {
			if (isApp) {
				await api.pushOff(appleEndpoint((await appleDevice()).token)).catch(() => {});
				appOff.set(true);
				return setState('off');
			}
			const sub = await (await registration())?.pushManager.getSubscription();
			if (sub) {
				await api.pushOff(sub.endpoint).catch(() => {});
				await sub.unsubscribe();
			}
			setState('off');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Alerts could not be turned off');
		} finally {
			setBusy(false);
		}
	}, []);

	/** A test alert to this device, right away. */
	const test = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			const at = await endpoint();
			if (!at) return setState('off');
			await api.pushTest(at);
			setTested(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "The test alert couldn't be sent");
		} finally {
			setBusy(false);
		}
	}, []);

	return { state, busy, error, tested, turnOn, turnOff, test };
}
