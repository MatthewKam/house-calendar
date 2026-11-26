import { useDailyThemes, type DailyCard, type Theme } from '../../lib/dailyThemes';
import { ENCOURAGEMENT_THEMES } from '../../lib/grownUpWords';
import { QUOTE_THEMES } from '../../lib/quotes';
import { useSetSetting, useSettings } from '../../lib/queries';
import Switch from '../ui/Switch';
import { Section, SwitchRow } from './parts';
import s from './styles/Settings.module.css';

/** "All on", "9 of 13 on", or (none on, so the card uses the usual ones) "None on". */
const onNote = (count: number, off: string[]) => {
	const on = count - off.length;
	return on === count ? 'All on' : on === 0 ? 'None on' : `${on} of ${count} on`;
};

/**
 * One card's themes for someone (or the wall), folded to a line on how many are on: a switch for all of
 * them, then a switch each.
 */
function ThemeSwitches<T>({
	title,
	themes,
	card,
	whose,
}: {
	title: string;
	themes: Theme<T>[];
	card: DailyCard;
	whose: string;
}) {
	const { off, turn, turnAll } = useDailyThemes(themes, card, whose);
	return (
		<Section title={title} note={onNote(themes.length, off)} folded>
			{/* On only while every one is: a tap turns them all on, or (all on) all off. */}
			<div className={`${s.switchHead} ${s.switchAll}`}>
				<strong>All</strong>
				<Switch on={off.length === 0} onChange={(v) => turnAll?.(v)} label={`All of ${title}`} />
			</div>
			{themes.map((t) => (
				<div key={t.id} className={s.switchHead}>
					<span>{t.name}</span>
					<Switch on={!off.includes(t.id)} onChange={(v) => turn?.(t.id, v)} label={t.name} />
				</div>
			))}
			<p className={s.hint}>With every one off, the card uses them all.</p>
		</Section>
	);
}

/**
 * Settings, Daily cards: the themes a grown-up's quote of the day and encouragement on Today come from,
 * and (for the family) whether kid mode's Today has its kind words and its fun fact.
 */
export default function DailyCardSettings({ me }: { me: string }) {
	const settings = useSettings().data;
	const setSetting = useSetSetting();
	return (
		<>
			<ThemeSwitches title="Your quote on Today" themes={QUOTE_THEMES} card="quote" whose={me} />
			<ThemeSwitches title="Your encouragement" themes={ENCOURAGEMENT_THEMES} card="encouragement" whose={me} />
			<SwitchRow
				title="Kids' quotes"
				on={settings?.kidQuotes !== false}
				onChange={(on) => setSetting.mutate({ key: 'kidQuotes', value: on })}
				hint="Kind words near the bottom of each kid's Today, for every kid in the family."
			/>
			<SwitchRow
				title="Kids' fun facts"
				on={settings?.kidFacts !== false}
				onChange={(on) => setSetting.mutate({ key: 'kidFacts', value: on })}
				hint="A fun fact at the bottom of each kid's Today (simpler ones for the littlest), for every kid in the family."
			/>
		</>
	);
}
