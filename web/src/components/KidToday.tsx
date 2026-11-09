import { useMemo } from "react";
import { addDays, dayKey, fromDayKey, timeLabel } from "../lib/dates";
import { factFor, type KidFact } from "../lib/kidFacts";
import { kindWordsFor } from "../lib/kindWords";
import { useLists, useRangeEvents, useWeather } from "../lib/queries";
import type { CalEvent, Member, SprigItem, Weather } from "../lib/types";
import { sky } from "../lib/weather";
import TodayAnimal from "./TodayAnimal";
import s from "../styles/KidMode.module.css";

/** How many days ahead a kid sees: today, tomorrow, and later this week. */
const DAYS = 7;

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
	// Things to remember.
	[/show.?and.?tell/i, "🧸"],
	[/water bottle|bottle/i, "🥤"],
	[/permission|form|slip|money|check/i, "📝"],
	[/pajama|pj|costume|hair|wear|shirt|dress up/i, "👕"],
	[/backpack|bag/i, "🎒"],
	[/snack/i, "🍎"],
];
const picture = (title: string, otherwise = "📅") => PICTURES.find(([re]) => re.test(title))?.[1] ?? otherwise;

/** Morning, afternoon or evening, as a picture. */
const partOfDay = (iso: string) => {
	const h = new Date(iso).getHours();
	return h < 12 ? "🌅" : h < 17 ? "☀️" : "🌙";
};

/**
 * Kid mode's Today, the morning screen: what to wear and the day's kind words, anything to remember, then
 * the kid's own events as big pictures (today with what's next picked out, tomorrow, and later this week),
 * or on a day with nothing on, an animal to tap; then the day's fun fact. On its side: the cards in rows of
 * two (a phone) or three (a tablet, the fact up top with the others), the calendar's days side by side.
 */
export default function KidToday({ today, kid }: { today: string; kid: Member }) {
	const little = (kid.stage ?? "little") === "little";
	const weather = useWeather().data;
	const lists = useLists().data ?? [];
	// Anything on a list for them, due today and not done yet.
	const remember = lists.flatMap((l) => l.items).filter((i) => !i.done && i.memberId === kid.id && i.due && dueOn(i, today));
	const from = useMemo(() => fromDayKey(today), [today]);
	const events = useRangeEvents(from, DAYS).data ?? [];
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

	// Later this week: each event with its day.
	const later = Array.from({ length: DAYS - 2 }, (_, i) => dayKey(addDays(from, i + 2)))
		.flatMap((key) => onDay(key).map((e) => ({ e, day: fromDayKey(key).toLocaleDateString([], { weekday: "short" }) })))
		// An all-day event over several days: once, on its first.
		.filter(({ e }, i, all) => all.findIndex((x) => x.e.id === e.id) === i);
	const todays = onDay(today);
	const tomorrows = onDay(dayKey(addDays(from, 1)));
	const event = (e: CalEvent, day?: string) => <KidEvent key={`${e.id}-${day ?? ""}`} event={e} day={day} next={e === next} over={!e.allDay && Date.parse(e.end) <= now} />;

	return (
		<div className={s.today}>
			{weather && <WhatToWear weather={weather} />}
			<Card label="Kind words" item={kindWordsFor(today)} />
			{remember.length > 0 && <Remember items={remember} />}
			{/* The calendar: today, tomorrow and later this week, kept together. */}
			<div className={s.calendar}>
			<section className={s.group} aria-label="Today">
				<h2 className={s.groupHead}>Today</h2>
				{todays.length === 0 ? (
					// Nothing on today: an animal to tap instead.
					<>
						<TodayAnimal />
						<p className={s.none}>Nothing on the calendar today.</p>
					</>
				) : (
					<ul className={s.events}>{todays.map((e) => event(e))}</ul>
				)}
			</section>
			{/* Tomorrow and later this week, left out when there's nothing on. */}
			{tomorrows.length > 0 && (
				<section className={s.group} aria-label="Tomorrow">
					<h2 className={s.groupHead}>Tomorrow</h2>
					<ul className={s.events}>{tomorrows.map((e) => event(e))}</ul>
				</section>
			)}
			{later.length > 0 && (
				<section className={s.group} aria-label="Later this week">
					<h2 className={s.groupHead}>Later this week</h2>
					<ul className={s.events}>{later.map(({ e, day }) => event(e, day))}</ul>
				</section>
			)}
			</div>
			<Card label="Did you know?" item={factFor(today, little)} />
		</div>
	);
}

/** Whether a list item's due today (YYYY-MM-DD): a day, or an instant on that day. */
const dueOn = (item: SprigItem, day: string) => (item.due!.length === 10 ? item.due === day : dayKey(new Date(item.due!)) === day);

/** What to wear: the clothes as big pictures, then the day's weather in small print for a grown-up. */
function WhatToWear({ weather: w }: { weather: Weather }) {
	const { pants, jacket, rain } = w.wear;
	const clothes = [
		rain ? { picture: RAIN_JACKET, name: "Rain jacket" } : jacket ? { picture: JACKET, name: "Jacket" } : { picture: "👕", name: "T-shirt" },
		pants ? { picture: "👖", name: "Pants" } : { picture: "🩳", name: "Shorts" },
		...(rain ? [{ picture: "🥾", name: "Rain boots" }, { picture: "☔", name: "Umbrella" }] : []),
	];
	const look = sky(w.days[0]?.code ?? w.code, true);
	return (
		<section className={s.wear} aria-label="What to wear">
			<span className={s.nextLabel}>What to wear</span>
			<ul className={s.clothes}>
				{clothes.map((c) => (
					<li key={c.name} className={s.clothing}>
						<span className={s.clothingPicture} aria-hidden="true">{c.picture}</span>
						{c.name}
					</li>
				))}
			</ul>
			<p className={s.weatherLine}>
				<span><span aria-hidden="true">{look.icon}</span> {look.label}</span>
				<span>Now {w.temp}°</span>
				<span>High {w.high}° · Low {w.low}°</span>
				<span>💧 {w.rainChance}%</span>
				<span>💨 {w.wind} mph</span>
			</p>
		</section>
	);
}

/**
 * A kid's jacket, drawn (the coat emoji is a grown-up's trench coat): hood up behind, sleeves out, a
 * zip (a rain jacket: buttons, and a bigger hood).
 */
function jacket({ cloth, trim, rain }: { cloth: string; trim: string; rain?: boolean }) {
	return (
		<svg viewBox="0 0 120 120" className={s.clothingDrawn}>
			{/* The hood, behind. */}
			<path d={rain ? "M32 34 Q60 -10 88 34 Q60 42 32 34z" : "M38 32 Q60 2 82 32 Q60 38 38 32z"} fill={trim} />
			<path d={rain ? "M44 28 Q60 6 76 28 Q60 32 44 28z" : "M46 28 Q60 12 74 28 Q60 31 46 28z"} fill={cloth} opacity="0.55" />
			{/* Sleeves, with cuffs. */}
			<path d="M36 30 L18 42 L10 92 L26 95 L34 58z M84 30 L102 42 L110 92 L94 95 L86 58z" fill={cloth} />
			<path d="M10 88 L26 91 L26 97 L9 94z M110 88 L94 91 L94 97 L111 94z" fill={trim} />
			{/* The body, with a band at the bottom. */}
			<path d="M34 28 Q60 20 86 28 L89 104 Q60 109 31 104z" fill={cloth} />
			<path d="M31 98 Q60 103 89 98 L89 106 Q60 111 31 106z" fill={trim} />
			{rain ? (
				<g fill={trim}>
					<circle cx="60" cy="46" r="3.5" />
					<circle cx="60" cy="64" r="3.5" />
					<circle cx="60" cy="82" r="3.5" />
				</g>
			) : (
				<>
					<path d="M60 30 V102" stroke="#e8eef8" strokeWidth="3" />
					<rect x="57" y="34" width="6" height="9" rx="2" fill="#e8eef8" />
					{/* Pockets. */}
					<path d="M40 74 h12 M68 74 h12" stroke={trim} strokeWidth="4" strokeLinecap="round" />
				</>
			)}
		</svg>
	);
}
const JACKET = jacket({ cloth: "#3d7bd9", trim: "#2a5aa8" });
const RAIN_JACKET = jacket({ cloth: "#f6c624", trim: "#d99a10", rain: true });

/** Things to remember today, from the family's lists, each with a picture. */
function Remember({ items }: { items: SprigItem[] }) {
	return (
		<section className={s.remember} aria-label="Don't forget">
			<span className={s.nextLabel}>Don't forget</span>
			<ul className={s.events}>
				{items.map((i) => (
					<li key={i.id} className={s.rememberItem}>
						<span className={s.eventPicture} aria-hidden="true">{picture(i.title, "📌")}</span>
						<span className={s.eventTitle}>{i.title}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

/** A card for the day: a big picture and one short sentence, for a grown-up to read aloud. */
function Card({ label, item }: { label: string; item: KidFact }) {
	return (
		<div className={s.fact}>
			<span className={s.factPicture} aria-hidden="true">{item.picture}</span>
			<span className={s.factText}>
				<span className={s.nextLabel}>{label}</span>
				{item.text}
			</span>
		</div>
	);
}

/** One event: its picture and title, and when (later this week: which day, too). */
function KidEvent({ event: e, day, next, over }: { event: CalEvent; day?: string; next: boolean; over: boolean }) {
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
						{day && <span className={s.eventDay}>{day}</span>}
						<span aria-hidden="true">🌈</span> All day
					</>
				) : (
					<>
						{day && <span className={s.eventDay}>{day}</span>}
						<span aria-hidden="true">{partOfDay(e.start)}</span> {timeLabel(e.start)}
					</>
				)}
			</span>
		</li>
	);
}
