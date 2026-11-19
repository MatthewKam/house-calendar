// An invite link (…/?join=ABCD-EFGH) opens the app with its code ready to use, through signing in
// if that's needed first. Taken out of the address straight away, so a refresh or a bookmark
// doesn't carry it.

import { SERVER } from './native';

let pending: string | null = null;
{
	const url = new URL(window.location.href);
	const code = url.searchParams.get('join');
	if (code) {
		pending = code;
		url.searchParams.delete('join');
		history.replaceState(null, '', url.pathname + url.search + url.hash);
	}
}

export const pendingJoin = () => pending;
export const clearJoin = () => void (pending = null);

/** The link that opens Sprig with this invite code ready (the website's address, also from the iPhone app). */
export const joinLink = (code: string) => `${SERVER || location.origin}/?join=${code}`;
