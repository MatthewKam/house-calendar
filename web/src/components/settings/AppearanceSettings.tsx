import type { CSSProperties } from 'react';
import { ACCENTS, accentOf, useAccentSetting } from '../../lib/accent';
import { useAuthStatus, useSetSetting, useSettings } from '../../lib/queries';
import { useTempUnit } from '../../lib/units';
import { useThemeSetting, type Theme } from '../../lib/useTheme';
import { UI_SCALES, useUiScale } from '../../lib/useUiScale';
import { Section } from './parts';
import s from './styles/Settings.module.css';
import { Segmented } from '../ui/Segmented';

const THEMES: [Theme, string][] = [
	['auto', 'Same as this device'],
	['light', 'Light'],
	['dark', 'Dark'],
];

/**
 * Settings, Appearance: how this device looks. The accent color (the wall wears the account holder's,
 * and the holder's pick becomes the household's), light or dark, °F or °C, and text size.
 */
export default function AppearanceSettings() {
	const auth = useAuthStatus().data;
	const settings = useSettings().data;
	const setSetting = useSetSetting();
	// Light or dark, for this device (Same as this device: its own setting).
	const [theme, setTheme] = useThemeSetting();
	const [accent, setAccent] = useAccentSetting();
	const [unit, setUnit] = useTempUnit();
	const [uiScale, setUiScale] = useUiScale();
	const wall = auth?.signedIn && auth.role === 'wall' ? auth : null;
	const holder = !!auth?.signedIn && auth.holder && auth.role === 'guardian';

	return (
		<>
			{/* Each a circle, half its light shade and half its dark: one pick, a shade for each. */}
			{wall ? (
				<Section title="Accent color" note={accentOf(settings?.accent).name}>
					<p className={s.themeNote}>The wall wears {wall.holderName ?? 'the account holder'}'s accent color.</p>
				</Section>
			) : (
				<Section title="Accent color" note={accent.name}>
					<div className={s.accents} role="radiogroup" aria-label="Accent color">
						{ACCENTS.map((a) => (
							<button
								key={a.id}
								type="button"
								role="radio"
								aria-checked={accent === a}
								className={s.accent}
								onClick={() => {
									setAccent(a);
									if (holder) setSetting.mutate({ key: 'accent', value: a.id });
								}}
							>
								<span
									className={`${s.accentDot} ${accent === a ? s.picked : ''}`}
									aria-hidden="true"
									style={{ '--light': a.light.accent, '--dark': a.dark.accent } as CSSProperties}
								/>
								{a.name}
							</button>
						))}
					</div>
					<p className={s.themeNote}>
						Buttons and highlights on this device. Each has a shade for light and one for dark.
						{holder && ' The wall wears yours too.'}
					</p>
				</Section>
			)}

			<Section title="Light or dark" note={THEMES.find(([v]) => v === theme)![1]}>
				<Segmented
					label="Light or dark"
					value={theme}
					className={s.lightOrDark}
					onChange={setTheme}
					options={THEMES.map(([id, label]) => ({ id, label }))}
				/>
				<p className={s.themeNote}>Kid mode stays light.</p>
			</Section>

			<Section title="Temperature" note={unit === 'C' ? '°C · km/h' : '°F · mph'}>
				<Segmented
					label="Temperature"
					value={unit}
					onChange={setUnit}
					options={[
						{ id: 'F', label: '°F' },
						{ id: 'C', label: '°C' },
					]}
				/>
				<p className={s.themeNote}>The weather on this device. Wind goes with it: mph with °F, km/h with °C.</p>
			</Section>

			<Section title="Text size" note={UI_SCALES.find((z) => Number(z.id) === uiScale)!.label}>
				<Segmented
					label="Text size"
					value={String(uiScale)}
					onChange={(id) => setUiScale(Number(id))}
					options={[...UI_SCALES]}
				/>
			</Section>
		</>
	);
}
