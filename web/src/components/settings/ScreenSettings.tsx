import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useScreenSaverSettings } from '../../lib/useScreenSaverSettings';
import ConfirmDialog from '../ui/ConfirmDialog';
import ScreenSaverSettings from './ScreenSaverSettings';
import { SwitchRow } from './parts';

/** "30 seconds", "2 minutes", "1 hour". */
const idleLabel = (minutes: number) =>
	minutes < 1
		? `${Math.round(minutes * 60)} seconds`
		: minutes >= 60
			? `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
			: `${minutes} minute${minutes === 1 ? '' : 's'}`;

/**
 * Settings, Screen: what this screen is for. Wall mode (a guardian's own device as the family wall),
 * the screen saver (tablets and computers, never a phone), and kid mode, each a switch.
 */
export default function ScreenSettings({
	wallMode,
	wallModeOn,
	screenSaver,
	onKidMode,
	onClose,
}: {
	/** Wall mode can be turned on here (a guardian's own device) or is on. */
	wallMode: boolean;
	wallModeOn: boolean;
	/** Not a phone: the screen saver can run. */
	screenSaver: boolean;
	onKidMode?: () => void;
	onClose: () => void;
}) {
	const [saver, saveSaver] = useScreenSaverSettings();
	const [wallModeAsk, setWallModeAsk] = useState(false);
	// Wall mode: everything on screen was this person's, so it all loads again as the wall's (or back).
	const qc = useQueryClient();
	const switchWallMode = (on: boolean) =>
		void api.setWallMode(on).then((st) => {
			qc.clear();
			qc.setQueryData(['auth'], st);
			onClose();
		});

	return (
		<>
			{wallMode && (
				<SwitchRow
					title="Wall mode"
					on={wallModeOn}
					onChange={(on) => (on ? setWallModeAsk(true) : switchWallMode(false))}
					hint={
						wallModeOn
							? 'This device is the family wall. Turning it off puts it back to your own account.'
							: "Make this device the family wall: everyone's shared calendar, your private events hidden, and changes and Settings behind a guardian's PIN. A guardian's PIN turns it off."
					}
				/>
			)}
			{screenSaver && (
				<SwitchRow
					title="Screen saver"
					on={saver.enabled}
					onChange={(on) => saveSaver({ enabled: on })}
					hint={
						saver.enabled
							? `Photos after ${idleLabel(saver.idleMinutes)} without a touch.`
							: 'Show photos when this screen is idle.'
					}
				>
					<ScreenSaverSettings bare switched />
				</SwitchRow>
			)}
			{onKidMode && (
				<SwitchRow
					title="Kid mode"
					on={false}
					onChange={(on) => on && onKidMode()}
					hint="Hand this device to a kid: their day, tasks, stars and games, and nothing else. A guardian's PIN turns it off."
				/>
			)}
			{wallModeAsk && (
				<ConfirmDialog
					title="Turn on wall mode?"
					confirmLabel="Turn on"
					safe
					onCancel={() => setWallModeAsk(false)}
					onConfirm={() => {
						setWallModeAsk(false);
						switchWallMode(true);
					}}
				>
					Your private events go out of sight here. To get back to your account, a guardian types their PIN.
				</ConfirmDialog>
			)}
		</>
	);
}
