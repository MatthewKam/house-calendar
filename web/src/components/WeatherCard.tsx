import { useEffect, useState, type CSSProperties } from "react";
import { useWeather } from "../lib/queries";
import { fromDayKey, timeLabel } from "../lib/dates";
import { sky } from "../lib/weather";
import s from "../styles/WeatherCard.module.css";


/** Which painted sky goes behind the current conditions. */
function scene(code: number, isDay: boolean) {
	if (!isDay) return s.night;
	if (code <= 1) return s.sunny;
	if (code === 2) return s.partly;
	if (code === 3 || code === 45 || code === 48) return s.cloudy;
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return s.snow;
	if (code >= 95) return s.storm;
	return s.rain;
}

/** The day's arc from sunrise to sunset, with the sun where it is now. */
function SunArc({ sunrise, sunset, now }: { sunrise: string; sunset: string; now: number }) {
	const rise = Date.parse(sunrise);
	const set = Date.parse(sunset);
	const f = Math.min(1, Math.max(0, (now - rise) / (set - rise)));
	const up = now >= rise && now <= set;
	const angle = Math.PI * (1 - f);
	const x = 100 + 84 * Math.cos(angle);
	const y = 92 - 84 * Math.sin(angle);
	const left = set - now;
	return (
		<div className={s.sun}>
			<svg viewBox="0 0 200 100" className={s.arc} aria-hidden="true">
				<line x1="4" y1="92" x2="196" y2="92" className={s.horizon} />
				<path d="M16 92 A84 84 0 0 1 184 92" className={s.track} />
				{/* The part of the day already gone. */}
				<path d="M16 92 A84 84 0 0 1 184 92" className={s.done} pathLength={1} strokeDasharray={`${f} 1`} />
				{up ? <circle cx={x} cy={y} r="9" className={s.sunDot} /> : <circle cx={x} cy={92} r="6" className={s.sunDown} />}
			</svg>
			<div className={s.sunTimes}>
				<span>
					<span className={s.sunLabel}>Sunrise</span> {timeLabel(sunrise)}
				</span>
				<span>
					<span className={s.sunLabel}>Sunset</span> {timeLabel(sunset)}
				</span>
			</div>
			<div className={s.daylight}>
				{up
					? `${Math.floor(left / 3_600_000)}h ${Math.round((left % 3_600_000) / 60_000)}m of daylight left`
					: now < rise
						? `Sun's up at ${timeLabel(sunrise)}`
						: "The sun has set"}
			</div>
		</div>
	);
}

/** Under the week, on a sky painted to match: the weather now, the sun's arc, and the next seven days. */
export default function WeatherCard() {
	const weather = useWeather().data;
	const [now, setNow] = useState(() => Date.now());
	// The days ahead stay tucked away until asked for.
	const [showWeek, setShowWeek] = useState(false);
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(t);
	}, []);
	// Needs the newer weather (with the forecast); a cached older answer has no days yet.
	if (!weather?.days) return null;
	const look = sky(weather.code, weather.isDay);
	// The week ahead starts tomorrow; today is already shown above.
	const ahead = weather.days.slice(1, 7);
	return (
		<section className={`${s.card} ${scene(weather.code, weather.isDay)}`} aria-label="Weather">
			<div className={s.now}>
				<span className={s.bigIcon} role="img" aria-label={look.label}>
					{look.icon}
				</span>
				<div>
					<div className={s.temp}>{weather.temp}°</div>
					<div className={s.label}>{look.label}</div>
					<div className={s.highLow}>
						H {weather.high}° · L {weather.low}°
					</div>
					<button className={s.weekToggle} aria-expanded={showWeek} onClick={() => setShowWeek(!showWeek)}>
						{showWeek ? "Hide forecast ▴" : "Next 6 days ▾"}
					</button>
				</div>
			</div>
			<SunArc sunrise={weather.sunrise} sunset={weather.sunset} now={now} />
			{showWeek && (
			<ol className={s.days}>
				{ahead.map((d) => {
					const look = sky(d.code, true);
					return (
						<li key={d.date}>
							<span className={s.dayName}>{fromDayKey(d.date).toLocaleDateString([], { weekday: "short" })}</span>
							<span className={s.dayIcon} role="img" aria-label={look.label} title={look.label}>
								{look.icon}
							</span>
							<span className={s.dayHigh}>{d.high}°</span>
							{/* A bar spanning the day's range, on the week's scale. */}
							<span
								className={s.range}
								style={rangeStyle(ahead, d)}
								aria-hidden="true"
							/>
							<span className={s.dayLow}>{d.low}°</span>
						</li>
					);
				})}
			</ol>
			)}
		</section>
	);
}

/** Positions a day's low-to-high bar within the week's coldest and warmest. */
function rangeStyle(days: { high: number; low: number }[], d: { high: number; low: number }) {
	const min = Math.min(...days.map((x) => x.low));
	const max = Math.max(...days.map((x) => x.high));
	const span = Math.max(1, max - min);
	return { "--from": `${((d.low - min) / span) * 100}%`, "--to": `${((d.high - min) / span) * 100}%` } as CSSProperties;
}
