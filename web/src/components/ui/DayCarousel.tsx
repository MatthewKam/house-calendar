import { useRef, useState, type ReactNode } from "react";
import { PHONE_SIDEWAYS, TABLET, useMediaQuery, WIDE } from "../../lib/useMediaQuery";

/** A day (or a few) of the calendar: its button's name, and what's on. */
interface CalendarDay {
	label: string;
	body: ReactNode;
}

/**
 * The page's CSS module (kid mode's and the grown-ups' Today each have their own look), with these
 * classes: calendar (the whole), group and groupHead (a day, its heading), and the carousel's: carousel,
 * dayButtons, dayButton, dayButtonOn, dayPage, dayFromRight and dayFromLeft; calendarStacked when stacked.
 */
type CalendarStyles = { readonly [name: string]: string };

/**
 * How the calendar's laid out: side by side on a phone on its side, and on a tablet either way up (or
 * anything bigger; all three when there's room). Matches the tablet layouts in the pages' styles.
 */
const SIDE_BY_SIDE = `${PHONE_SIDEWAYS}, ${TABLET}`;
const ALL_THREE = WIDE;

/**
 * The calendar's days. Upright: a carousel of all three, big buttons along the top to go to each (or a
 * swipe). On its side: the first, and a carousel of the others beside it. Wider than 1400px: all three
 * side by side. `stacked` (a column of its own): the first, and a carousel of the others under it.
 */
export function DayCalendar({ days, styles: s, stacked = false }: { days: CalendarDay[]; styles: CalendarStyles; stacked?: boolean }) {
	const sideBySide = useMediaQuery(SIDE_BY_SIDE);
	const allThree = useMediaQuery(ALL_THREE);
	const day = (d: CalendarDay) => (
		<section key={d.label} className={s.group} aria-label={d.label}>
			<h2 className={s.groupHead}>{d.label}</h2>
			{d.body}
		</section>
	);
	if (stacked) {
		return (
			<div className={`${s.calendar} ${s.calendarStacked}`}>
				{day(days[0])}
				<Carousel days={days.slice(1)} styles={s} />
			</div>
		);
	}
	if (allThree) return <div className={s.calendar}>{days.map(day)}</div>;
	if (sideBySide) {
		return (
			<div className={s.calendar}>
				{day(days[0])}
				<Carousel days={days.slice(1)} styles={s} />
			</div>
		);
	}
	return (
		<div className={s.calendar}>
			<Carousel days={days} styles={s} />
		</div>
	);
}

/** Days a page at a time: a button for each along the top, and a swipe to the next or back. */
function Carousel({ days, styles: s }: { days: CalendarDay[]; styles: CalendarStyles }) {
	const [at, setAt] = useState(0);
	// Which way the last move went, so the new day slides in from that side.
	const [from, setFrom] = useState<"right" | "left">("right");
	const go = (i: number) => {
		if (i < 0 || i >= days.length || i === at) return;
		setFrom(i > at ? "right" : "left");
		setAt(i);
	};
	const swipe = useRef<{ x: number; y: number } | null>(null);
	const shown = days[Math.min(at, days.length - 1)];
	return (
		<div
			className={s.carousel}
			onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
			onPointerUp={(e) => {
				const start = swipe.current;
				swipe.current = null;
				if (!start) return;
				const dx = e.clientX - start.x;
				// Mostly sideways, and far enough to mean it.
				if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - start.y))
					go(at + (dx < 0 ? 1 : -1));
			}}
		>
			<div className={s.dayButtons} role="tablist">
				{days.map((d, i) => (
					<button
						key={d.label}
						type="button"
						role="tab"
						aria-selected={i === at}
						className={`${s.dayButton} ${i === at ? s.dayButtonOn : ""}`}
						onClick={() => go(i)}
					>
						{d.label}
					</button>
				))}
			</div>
			<section
				key={shown.label}
				role="tabpanel"
				aria-label={shown.label}
				className={`${s.dayPage} ${from === "right" ? s.dayFromRight : s.dayFromLeft}`}
			>
				{shown.body}
			</section>
		</div>
	);
}
