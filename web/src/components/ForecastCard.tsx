import { fromDayKey } from "../lib/dates";
import { sky } from "../lib/weather";
import type { Weather } from "../lib/types";
import s from "../styles/Today.module.css";

/** "5 PM", or "Now" for the first. */
const hourLabel = (iso: string, first: boolean) =>
	first ? "Now" : new Date(iso).toLocaleTimeString([], { hour: "numeric" });

/**
 * The grown-ups' Today weather: now (how warm it feels, the sky, the day's high and low, rain and wind),
 * the next twelve hours across, then the week, each day with its rain and wind.
 */
export default function ForecastCard({ weather: w }: { weather: Weather }) {
	const now = sky(w.code, w.isDay);
	// Day or night for an hour ahead: between today's sunrise and sunset, by the clock.
	const rise = new Date(w.sunrise).getHours();
	const set = new Date(w.sunset).getHours();
	const isDay = (iso: string) => {
		const h = new Date(iso).getHours();
		return h >= rise && h < set;
	};
	return (
		<section className={`${s.card} ${s.forecast}`} aria-label="Weather">
			<h2 className={s.cardHead}>Weather</h2>
			<div className={s.weatherNow}>
				<span className={s.weatherIcon} aria-hidden="true">{now.icon}</span>
				<span className={s.weatherTemp}>{w.temp}°</span>
				<span className={s.weatherFacts}>
					<b>Feels like {w.feels}°</b>
					<span>{now.label}</span>
					<span>High {w.high}° · Low {w.low}°</span>
					<span>
						<span className={s.nowrap}>💧 {w.rainChance}% rain</span> · <span className={s.nowrap}>💨 {w.wind} mph</span>
					</span>
				</span>
			</div>
			{w.hours.length > 0 && (
				<ol className={s.hours} aria-label="The next hours">
					{w.hours.map((h, i) => (
						<li key={h.time} className={s.hour}>
							<span className={s.hourWhen}>{hourLabel(h.time, i === 0)}</span>
							<span className={s.hourIcon} aria-hidden="true">{sky(h.code, isDay(h.time)).icon}</span>
							<span className={s.hourTemp}>{h.temp}°</span>
							<span className={s.hourMore}>Feels {h.feels}°</span>
							<span className={s.hourMore}>{h.rain > 0 ? `💧 ${h.rain}%` : " "}</span>
						</li>
					))}
				</ol>
			)}
			<ul className={s.week} aria-label="This week">
				{w.days.map((d, i) => {
					const look = sky(d.code, true);
					return (
						<li key={d.date} className={s.weekDay}>
							<span className={s.weekName}>{i === 0 ? "Today" : fromDayKey(d.date).toLocaleDateString([], { weekday: "short" })}</span>
							<span className={s.weekIcon} title={look.label}>
								<span aria-hidden="true">{look.icon}</span>
							</span>
							<span className={s.weekRain} aria-label={`${d.rain}% chance of rain`}>💧 {d.rain}%</span>
							<span className={s.weekWind} aria-label={`wind up to ${d.wind} mph`}>💨 {d.wind}</span>
							<span className={s.weekTemps}>
								<span className={s.weekLow}>{d.low}°</span> {d.high}°
							</span>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
