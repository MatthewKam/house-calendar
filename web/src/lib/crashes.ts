import { Capacitor } from '@capacitor/core';
import { SprigError } from './api';
import { SERVER, authHeaders } from './native';

// Crash reports (server/crashes.ts): when part of the app breaks (an ErrorBoundary catches it) or an error
// nothing caught, the app tells Sprig what broke, where, and on which build and platform, so it can be fixed.
// Nothing anyone typed: the error, its stack and the part's name. Not the problems the app already shows
// (no connection, a refused change), and each crash once per visit, at most a few.

/** This build: when it was made (vite.config.ts), e.g. 2611271805. */
const VERSION: string = import.meta.env.VITE_BUILD ?? 'dev';
const MAX_PER_VISIT = 10;
const sent = new Set<string>();

/** Problems that aren't crashes: ones the app shows (SprigError), a lookup stopped on purpose, no connection. */
function expected(err: unknown) {
	if (err instanceof SprigError) return true;
	const e = err as { name?: string; message?: string } | null;
	return (
		e?.name === 'AbortError' ||
		/^(Failed to fetch|Load failed|NetworkError|ResizeObserver loop|Script error\.?$)/.test(e?.message ?? '')
	);
}

/** Tells Sprig about a crash. Never throws. `place`: the part of the app ("Today", "kid mode"). */
export function reportCrash(err: unknown, place: string, extra?: string) {
	try {
		if (expected(err)) return;
		const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
		const message = `${e.name}: ${e.message}`;
		const key = `${place}\n${message}`;
		if (sent.has(key) || sent.size >= MAX_PER_VISIT) return;
		sent.add(key);
		const stack = [e.stack, extra].filter(Boolean).join('\n--\n');
		void fetch(`${SERVER}/api/crash`, {
			method: 'POST',
			keepalive: true,
			headers: { ...authHeaders(), 'content-type': 'application/json' },
			body: JSON.stringify({
				message: message.slice(0, 2000),
				stack: stack.slice(0, 16_000),
				place: place.slice(0, 200),
				platform: Capacitor.getPlatform(),
				version: VERSION,
			}),
		}).catch(() => {});
	} catch {
		// Reporting a crash mustn't cause another.
	}
}

/** Errors nothing caught, anywhere in the app, reported too. */
export function watchCrashes() {
	window.addEventListener('error', (ev) => reportCrash(ev.error ?? ev.message, 'uncaught'));
	window.addEventListener('unhandledrejection', (ev) => reportCrash(ev.reason, 'uncaught promise'));
}
