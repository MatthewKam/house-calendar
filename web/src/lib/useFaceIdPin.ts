import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { biometry, biometryName, forgetFacePin, hasFacePin, readFacePin, saveFacePin } from './native';
import { useAuthStatus } from './queries';

/**
 * Face ID instead of the guardian PIN, on a grown-up's own iPhone or iPad in the app (ios/App/App/FaceIdPin.swift
 * keeps their PIN behind Face ID). Never on a kid's device or the wall: Face ID there could be the kid's face.
 * `kind` is none where it can't be used; `saved` is whether it's turned on here (Settings → Users).
 */
export function useFaceIdPin() {
	const auth = useAuthStatus().data;
	const me = auth?.signedIn && auth.kind === 'user' && auth.role === 'guardian' ? auth.memberId : null;
	const qc = useQueryClient();
	const key = ['faceIdPin', me];
	const state = useQuery({
		queryKey: key,
		enabled: !!me,
		// Asked again whenever it's shown and when Sprig comes back: Face ID may have been set up (or turned
		// off for Sprig) in the iPhone's Settings meanwhile.
		refetchOnMount: 'always',
		refetchOnWindowFocus: 'always',
		queryFn: async () => {
			const { kind, ready, why } = await biometry();
			return { kind, ready, why: why ?? '', saved: ready && !!me && (await hasFacePin(me)) };
		},
	});
	const kind = (me && state.data?.kind) || 'none';
	const ready = kind !== 'none' && !!state.data?.ready;
	const saved = ready && !!state.data?.saved;
	const set = (on: boolean) => qc.setQueryData(key, { ...state.data, kind, ready, saved: on });
	return {
		/** Face ID, Touch ID, or none (the website, a device with neither, or not this grown-up's own). */
		kind,
		/** Set up with a face enrolled, and allowed for Sprig. */
		ready,
		/** When it isn't: notEnrolled, notAllowed, lockedOut or noPasscode (iOS's reason). */
		why: state.data?.why ?? '',
		/** "Face ID" or "Touch ID". */
		name: biometryName(kind),
		saved,
		/** Keeps this PIN behind Face ID (it's been checked with the server first). */
		save: async (pin: string) => {
			if (!me) return;
			await saveFacePin(me, pin);
			set(true);
		},
		forget: async () => {
			if (!me) return;
			await forgetFacePin(me);
			set(false);
		},
		/** The saved PIN after Face ID, or null (closed, or Face ID changed: then it's forgotten). */
		read: async () => {
			if (!me || !saved) return null;
			try {
				return await readFacePin(me, `Use ${biometryName(kind)} instead of your PIN`);
			} catch (e) {
				if ((e as { code?: string })?.code === 'missing') set(false);
				return null;
			}
		},
	};
}

/**
 * For a PIN sheet: asks for Face ID as soon as it opens (when it's on here), and sends the saved PIN to `onPin`.
 * `ask` tries again; `fromFace` says the PIN being checked came from Face ID, and `wrong` forgets it when the
 * server turns it down (the PIN was changed on another device). Null when Face ID isn't on here.
 */
export function usePinByFace(onPin: (pin: string) => void) {
	const face = useFaceIdPin();
	const fromFace = useRef(false);
	const asked = useRef(false);
	const latest = useRef(onPin);
	latest.current = onPin;
	const read = face.read;
	const ask = useCallback(async () => {
		const pin = await read();
		if (!pin) return;
		fromFace.current = true;
		latest.current(pin);
	}, [read]);
	useEffect(() => {
		if (!face.saved || asked.current) return;
		asked.current = true;
		void ask();
	}, [face.saved, ask]);
	if (!face.saved) return null;
	return {
		name: face.name,
		ask: () => void ask(),
		/** The PIN just checked was turned down: forget a saved one that came from Face ID. */
		wrong: () => {
			if (fromFace.current) void face.forget();
			fromFace.current = false;
		},
		/** A PIN typed by hand is being checked. */
		typed: () => {
			fromFace.current = false;
		},
	};
}
