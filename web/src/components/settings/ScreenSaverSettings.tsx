import { TRANSITIONS } from '../../lib/screensaver';
import { useScreenSaverSettings } from '../../lib/useScreenSaverSettings';
import type { ScreenSaverSettings as Settings } from '../../lib/types';
import { useWakeStatus, type WakeStatus } from '../../lib/useWakeLock';
import s from './Settings.module.css';
import { Button } from '../ui/Button';
import Switch from '../ui/Switch';
import { Field, Input, Select } from '../ui/Field';
import { List, ListRow } from '../ui/ListRow';

/** Minutes without a touch before it starts. */
/** Whether this device's screen is being kept on, in words. */
const WAKE: Record<WakeStatus, string> = {
	on: 'This screen stays on, so the screen saver takes over instead of it sleeping. If it still sleeps, set its Auto-Lock to Never.',
	off: 'This screen may sleep (the screen saver is off, or no photos are picked for it).',
	'low-battery': 'The battery is low, so this screen may sleep.',
	'needs-https': "Keeping this screen on with a hidden video (the wall's https:// address would do it better).",
	unsupported: 'Keeping this screen on with a hidden video (this browser has no wake lock).',
	refused: 'Keeping this screen on with a hidden video: the wake lock was refused',
};

const IDLE: [number, string][] = [
	[0.5, '30 seconds'],
	[1, '1 minute'],
	[2, '2 minutes'],
	[5, '5 minutes'],
	[10, '10 minutes'],
	[15, '15 minutes'],
	[30, '30 minutes'],
	[60, '1 hour'],
];
const SECONDS: [number, string][] = [
	[10, '10 seconds'],
	[20, '20 seconds'],
	[30, '30 seconds'],
	[60, '1 minute'],
	[120, '2 minutes'],
	[300, '5 minutes'],
	[1200, '20 minutes'],
];

/**
 * Settings for the photo screen saver (in Settings, and on the Photos page). Which photos it shows is
 * picked on the Photos page.
 */
export default function ScreenSaverSettings({
	onPreview,
	bare,
	switched,
}: {
	onPreview?: () => void;
	/** In its own pop-up: no heading or divider. */
	bare?: boolean;
	/** Turned on and off by a switch beside it (Settings): no checkbox of its own. */
	switched?: boolean;
}) {
	const [saver, save] = useScreenSaverSettings();
	const wake = useWakeStatus();
	return (
		<section className={bare ? s.bare : s.home}>
			{!bare && <h3 className={s.section}>Screen saver</h3>}
			{!switched && (
				<List>
					<ListRow
						title="Show photos when this screen is idle"
						trailing={
							<Switch
								on={saver.enabled}
								onChange={(on) => save({ enabled: on })}
								label="Show photos when this screen is idle"
							/>
						}
					/>
				</List>
			)}
			{saver.enabled && (
				<>
					<div className={s.saverGrid}>
						<Field label="Start after">
							<Select value={saver.idleMinutes} onChange={(e) => save({ idleMinutes: Number(e.target.value) })}>
								{IDLE.map(([m, label]) => (
									<option key={m} value={m}>
										{label}
									</option>
								))}
							</Select>
						</Field>
						<Field label="Each photo for">
							<Select value={saver.seconds} onChange={(e) => save({ seconds: Number(e.target.value) })}>
								{SECONDS.map(([v, l]) => (
									<option key={v} value={v}>
										{l}
									</option>
								))}
							</Select>
						</Field>
						<Field label="Transition">
							<Select
								value={saver.transition}
								onChange={(e) => save({ transition: e.target.value as Settings['transition'] })}
							>
								{TRANSITIONS.map((t) => (
									<option key={t.id} value={t.id}>
										{t.label}
									</option>
								))}
							</Select>
						</Field>
					</div>
					<List>
						<ListRow
							title="Show today's events"
							detail="Bottom left, under the clock"
							trailing={
								<Switch on={saver.showEvents} onChange={(on) => save({ showEvents: on })} label="Show today's events" />
							}
						/>
						<ListRow
							title="Dim the photos at night"
							detail="And change them more slowly"
							trailing={
								<Switch on={saver.night} onChange={(on) => save({ night: on })} label="Dim the photos at night" />
							}
						/>
					</List>
					{saver.night && (
						<div className={s.saverGrid}>
							<Field label="From">
								<Input
									type="time"
									value={saver.nightFrom}
									onChange={(e) => e.target.value && save({ nightFrom: e.target.value })}
								/>
							</Field>
							<Field label="Until">
								<Input
									type="time"
									value={saver.nightTo}
									onChange={(e) => e.target.value && save({ nightTo: e.target.value })}
								/>
							</Field>
						</div>
					)}
					<p className={s.hint}>Pick which photos it shows on the Photos page.</p>
					<p className={s.hint}>
						{WAKE[wake.status]}
						{wake.status === 'refused' &&
							` (${wake.reason || 'no reason given'}). Tap anywhere to try the wake lock again; Low Power Mode stops both.`}
					</p>
					{onPreview && (
						<Button variant="link" size="sm" onClick={onPreview}>
							Play it now
						</Button>
					)}
				</>
			)}
		</section>
	);
}
