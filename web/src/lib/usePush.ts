import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/**
 * Alerts on this device (server/push.ts): what the switch in Settings shows.
 * - on / off: they can be turned on or off here.
 * - home-screen: an iPhone or iPad in Safari; alerts need Sprig added to the Home Screen first.
 * - blocked: the browser was told no; it's allowed again in its settings.
 * - unsupported: this browser can't (or the server has alerts off).
 */
export type PushState = 'loading' | 'on' | 'off' | 'home-screen' | 'blocked' | 'unsupported';

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

async function current(): Promise<PushState> {
	if (!('Notification' in window) || !('PushManager' in window))
		return IOS && !STANDALONE ? 'home-screen' : 'unsupported';
	if (Notification.permission === 'denied') return 'blocked';
	const reg = await registration();
	if (!reg) return 'unsupported';
	const sub = await reg.pushManager.getSubscription();
	if (!sub) return 'off';
	// Tell the server again: it may have forgotten this device, or the time zone moved with a trip.
	await api.pushOn(sub.toJSON(), zone()).catch(() => {});
	return 'on';
}

export function usePush() {
	const [state, setState] = useState<PushState>('loading');
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

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
		try {
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

	return { state, busy, error, turnOn, turnOff };
}
