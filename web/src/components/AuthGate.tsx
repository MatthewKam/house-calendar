import { useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import PinScreen from "./PinScreen";

/**
 * Shows the app on a signed-in device (or while no family PIN is set); otherwise the PIN screen.
 * If the device is signed out later (from Settings, or a PIN change), it goes back to the PIN screen.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
	const qc = useQueryClient();
	const status = useQuery({ queryKey: ["auth"], queryFn: api.authStatus, retry: 1 });
	useEffect(() => {
		const signedOut = () => void qc.invalidateQueries({ queryKey: ["auth"] });
		window.addEventListener("household:signed-out", signedOut);
		return () => window.removeEventListener("household:signed-out", signedOut);
	}, [qc]);

	if (status.isPending) return null;
	if (status.data && status.data.pinSet && !status.data.signedIn) {
		return (
			<PinScreen
				onSignedIn={() => {
					// Everything is fetched again now that this device may see it.
					void qc.invalidateQueries();
				}}
			/>
		);
	}
	return <>{children}</>;
}
