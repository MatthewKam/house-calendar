import { useDailyThemes, WALL, type DailyCard, type Theme } from '../../lib/dailyThemes';
import { ENCOURAGEMENT_THEMES } from '../../lib/grownUpWords';
import { QUOTE_THEMES } from '../../lib/quotes';
import Switch from '../ui/Switch';
import { Section } from './parts';
import s from './styles/Settings.module.css';

/** "All on", "9 of 13 on", or (none on, so the card uses the usual ones) "None on". */
const onNote = (count: number, off: string[]) => {
	const on = count - off.length;
	return on === count ? 'All on' : on === 0 ? 'None on' : `${on} of ${count} on`;
};

/** One card's themes for someone (or the wall), folded to a line on how many are on: a switch each. */
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
	const { off, turn } = useDailyThemes(themes, card, whose);
	return (
		<Section title={title} note={onNote(themes.length, off)}>
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
 * Settings, Daily cards: the themes the quote of the day and the encouragement come from. A grown-up's own
 * for their Today, and the family's for the calendar page and the wall.
 */
export default function DailyCardSettings({ me }: { me: string | null }) {
	return (
		<>
			{me && (
				<>
					<ThemeSwitches title="Your quote on Today" themes={QUOTE_THEMES} card="quote" whose={me} />
					<ThemeSwitches title="Your encouragement" themes={ENCOURAGEMENT_THEMES} card="encouragement" whose={me} />
				</>
			)}
			<ThemeSwitches title="The calendar and wall's quote" themes={QUOTE_THEMES} card="quote" whose={WALL} />
		</>
	);
}
