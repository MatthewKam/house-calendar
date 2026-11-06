import { useMemo } from "react";
import { addDays, dayKey, fromDayKey, timeLabel } from "../lib/dates";
import { useRangeEvents } from "../lib/queries";
import type { CalEvent, Member, Stage } from "../lib/types";
import s from "../styles/KidMode.module.css";

/** How many days a kid sees, growing with them: today for the littlest, then tomorrow too, then the week. */
const DAYS: Record<Stage, number> = { little: 1, early: 2, middle: 7, tween: 7, teen: 7, adult: 7 };

/** A picture for an event, from words in its title (a calendar for kids who can't read yet). */
const PICTURES: [RegExp, string][] = [
	[/birthday|bday/i, "🎂"],
	[/swim|pool/i, "🏊"],
	[/soccer|football/i, "⚽"],
	[/basketball/i, "🏀"],
	[/baseball|t-?ball|softball/i, "⚾"],
	[/gym|tumbl|gymnast/i, "🤸"],
	[/dance|ballet/i, "💃"],
	[/music|piano|violin|guitar|sing/i, "🎵"],
	[/art|paint|craft/i, "🎨"],
	[/dentist|teeth/i, "🦷"],
	[/doctor|check-?up|clinic|shot/i, "🩺"],
	[/hair ?cut|barber/i, "💇"],
	[/library|book|story/i, "📚"],
	[/school|class|preschool|daycare|teacher/i, "🏫"],
	[/park|playground/i, "🛝"],
	[/zoo/i, "🦁"],
	[/beach/i, "🏖️"],
	[/camp/i, "🏕️"],
	[/church|mass|temple|mosque/i, "⛪"],
	[/party|celebrat/i, "🎉"],
	[/play ?date|friend/i, "🧸"],
	[/grandma|grandpa|nana|papa|grandparent/i, "👵"],
	[/trip|flight|fly|vacation|holiday/i, "✈️"],
	[/dinner|lunch|breakfast|brunch|pizza|restaurant/i, "🍽️"],
	[/movie|film|cinema/i, "🎬"],
	[/sleep ?over/i, "🛏️"],
	[/no school|day off/i, "🌈"],
];
const picture = (title: string) => PICTURES.find(([re]) => re.test(title))?.[1] ?? "📅";

/** Morning, afternoon or evening, as a picture. */
const partOfDay = (iso: string) => {
	const h = new Date(iso).getHours();
	return h < 12 ? "🌅" : h < 17 ? "☀️" : "🌙";
};

/**
 * Kid mode's Today: the kid's own events as big pictures, today first, with
 * what's next picked out. Older kids see more days ahead.
 */
export default function KidToday({ today, kid }: { today: string; kid: Member }) {
	const days = DAYS[kid.stage ?? "little"];
	const from = useMemo(() => fromDayKey(today), [today]);
	const events = useRangeEvents(from, days).data ?? [];
	const now = Date.now();
	// Only the ones they're on (not ones for everyone or no one in particular).
	const mine = events.filter((e) => !e.busy && e.memberIds.includes(kid.id));
	const next = mine
		.filter((e) => !e.allDay && Date.parse(e.end) > now)
		.sort((a, b) => a.start.localeCompare(b.start))[0];

	const onDay = (key: string) =>
		mine
			.filter((e) => (e.allDay ? e.start <= key && e.end > key : dayKey(new Date(e.start)) === key))
			.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));

	return (
		<>
			{Array.from({ length: days }, (_, i) => {
				const key = dayKey(addDays(from, i));
				const list = onDay(key);
				const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : fromDayKey(key).toLocaleDateString([], { weekday: "long" });
				// Days after today with nothing on are left out; today always shows.
				if (i > 0 && list.length === 0) return null;
				return (
					<section key={key} className={s.group} aria-label={label}>
						<h2 className={s.groupHead}>{label}</h2>
						{list.length === 0 && <p className={s.none}>Nothing on the calendar. 🌈</p>}
						<ul className={s.events}>
							{list.map((e) => <KidEvent key={e.id} event={e} next={e === next} over={!e.allDay && Date.parse(e.end) <= now} />)}
						</ul>
					</section>
				);
			})}
		</>
	);
}

function KidEvent({ event: e, next, over }: { event: CalEvent; next: boolean; over: boolean }) {
	return (
		<li className={`${s.event} ${next ? s.eventNext : ""} ${over ? s.eventOver : ""}`}>
			<span className={s.eventPicture} aria-hidden="true">{picture(e.title)}</span>
			<span className={s.eventText}>
				{next && <span className={s.nextLabel}>Next</span>}
				<span className={s.eventTitle}>{e.title}</span>
			</span>
			<span className={s.eventTime}>
				{e.allDay ? (
					<>
						<span aria-hidden="true">🌈</span> All day
					</>
				) : (
					<>
						<span aria-hidden="true">{partOfDay(e.start)}</span> {timeLabel(e.start)}
					</>
				)}
			</span>
		</li>
	);
}
