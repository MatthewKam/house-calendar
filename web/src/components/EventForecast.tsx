import { fromDayKey } from "../lib/dates";
import { useEventWeather } from "../lib/queries";
import { sky } from "../lib/weather";
import type { CalEvent, EventWeather, Wear } from "../lib/types";
import s from "../styles/EventForecast.module.css";

/** What to pack for the weather there (the same rules as What to wear). */
export function packFor(wear: Wear) {
	return [
		wear.rain ? "☂️ Umbrella" : null,
		wear.jacket ? "🧥 Jacket" : null,
		wear.pants ? "👖 Long pants" : "🩳 Shorts",
	].filter((x): x is string => !!x);
}

/** "☀️ 84°" for a row: the first day's sky and high (a timed event: at its start). */
export function forecastBadge(w: EventWeather) {
	const day = w.days[0];
	if (!day) return null;
	return `${sky(w.at?.code ?? day.code, true).icon} ${w.at?.temp ?? day.high}°`;
}

/**
 * The weather at a far-away event (15 miles or more from home), on its days: a line a day, the hour it
 * starts for a timed one, and what to pack. Nothing for a nearby event: Today's weather covers it.
 */
export default function EventForecast({ event }: { event: CalEvent }) {
	const w = useEventWeather(event.location ? [event.id] : []).data?.[event.id];
	if (!w) return null;
	const weekday = (date: string) => fromDayKey(date).toLocaleDateString([], { weekday: "short" });
	return (
		<section className={s.box} aria-label="Weather there">
			<div className={s.head}>
				<span className={s.label}>Weather there</span>
				<span className={s.miles}>{w.miles} miles from home</span>
			</div>
			{w.later ? (
				<p className={s.note}>The forecast shows up about 2 weeks before.</p>
			) : (
				<>
					{w.at && (
						<div className={s.day}>
							<span className={s.icon} aria-hidden="true">{sky(w.at.code, true).icon}</span>
							<span>
								<b>{w.at.temp}° when it starts</b> · feels {w.at.feels}° · 💧 {w.at.rain}%
							</span>
						</div>
					)}
					{w.days.map((d) => {
						const look = sky(d.code, true);
						return (
							<div key={d.date} className={s.day}>
								<span className={s.icon} aria-hidden="true">{look.icon}</span>
								<span>
									{w.days.length > 1 && <b>{weekday(d.date)} </b>}
									{look.label} · High {d.high}° · Low {d.low}° · 💧 {d.rain}%
								</span>
							</div>
						);
					})}
					{w.wear && <div className={s.pack}>Pack: {packFor(w.wear).join(" · ")}</div>}
				</>
			)}
		</section>
	);
}
