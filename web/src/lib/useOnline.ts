import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { connection } from './api';

/**
 * Whether this device has a connection, as the data hooks see it (TanStack's onlineManager, which
 * listens for the browser's online and offline). Offline, loading waits and edits wait their turn.
 */
export function useOnline() {
	return useSyncExternalStore(
		(onChange) => onlineManager.subscribe(onChange),
		() => onlineManager.isOnline(),
	);
}

/** Whether Sprig's server is answering: false after a request couldn't get through (a weak signal, say). */
export function useGettingThrough() {
	return useSyncExternalStore(connection.subscribe, connection.through);
}

/** The words for something that can't work offline, shown in place of trying. */
export const NEEDS_INTERNET = 'Needs the internet. Try again when you’re connected.';
