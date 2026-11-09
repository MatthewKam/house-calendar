import { useMemo } from "react";
import { addDays, dayKey, fromDayKey, timeLabel } from "../lib/dates";
import { factFor, type KidFact } from "../lib/kidFacts";
import { kindWordsFor } from "../lib/kindWords";
import { useLists, useRangeEvents, useWeather } from "../lib/queries";
import type { CalEvent, Member, SprigItem, Stage, Weather } from "../lib/types";
import { sky } from "../lib/weather";
import TodayAnimal from "./TodayAnimal";
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
 * Kid mode's Today, the morning screen: what to wear, anything to remember, the kid's own events as big
 * pictures (what's next picked out; older kids see more days ahead), or on a day with nothing on, an
 * animal to tap; then the day's fun fact and kind words.
 */
export default function KidToday({ today, kid }: { today: string; kid: Member }) {
	const little = (kid.stage ?? "little") === "little";
	const weather = useWeather().data;
	const lists = useLists().data ?? [];
	// Anything on a list for them, due today and not done yet.
	const remember = lists.flatMap((l) => l.items).filter((i) => !i.done && i.memberId === kid.id && i.due && dueOn(i, today));
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
			{weather && <WhatToWear weather={weather} />}
			{remember.length > 0 && <Remember items={remember} />}
			{Array.from({ length: days }, (_, i) => {
				const key = dayKey(addDays(from, i));
				const list = onDay(key);
				const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : fromDayKey(key).toLocaleDateString([], { weekday: "long" });
				// Days after today with nothing on are left out; today always shows.
				if (i > 0 && list.length === 0) return null;
				return (
					<section key={key} className={s.group} aria-label={label}>
						<h2 className={s.groupHead}>{label}</h2>
						{/* Nothing on today: an animal to tap instead. */}
						{list.length === 0 && <TodayAnimal />}
						<ul className={s.events}>
							{list.map((e) => <KidEvent key={e.id} event={e} next={e === next} over={!e.allDay && Date.parse(e.end) <= now} />)}
						</ul>
					</section>
				);
			})}
			<Card label="Did you know?" item={factFor(today, little)} />
			<Card label="Kind words" item={kindWordsFor(today)} />
		</>
	);
}

/** Whether a list item's due today (YYYY-MM-DD): a day, or an instant on that day. */
const dueOn = (item: SprigItem, day: string) => (item.due!.length === 10 ? item.due === day : dayKey(new Date(item.due!)) === day);

/** What to wear: the clothes as big pictures, then the day's weather in small print for a grown-up. */
function WhatToWear({ weather: w }: { weather: Weather }) {
	const { pants, jacket, rain } = w.wear;
	const clothes = [
		rain ? { picture: "🧥", name: "Rain jacket" } : jacket ? { picture: "🧥", name: "Jacket" } : { picture: "👕", name: "T-shirt" },
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
				<span>{w.high}° / {w.low}°</span>
				<span>💧 {w.rainChance}%</span>
				<span>☁️ {w.cloudCover}%</span>
				<span>💨 {w.wind} mph</span>
			</p>
		</section>
	);
}

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
