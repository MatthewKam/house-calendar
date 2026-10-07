import { useEffect, useState } from "react";
import { useWeather } from "../lib/queries";
import { sky } from "../lib/weather";
import s from "../styles/App.module.css";

/** Under the month: the time, then the weather at home (now, with today's high and low muted). */
export default function NowLine() {
	const weather = useWeather().data;
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		// Ticks on the minute, so the clock never lags.
		let timer = setTimeout(function tick() {
			setNow(new Date());
			timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
		}, 60_000 - (Date.now() % 60_000));
		return () => clearTimeout(timer);
	}, []);
	const look = weather && sky(weather.code, weather.isDay);
	return (
		<div className={s.now}>
			<span className={s.clock}>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
			{weather && look && (
				<span className={s.weather} title={look.label}>
					<span className={s.sky} role="img" aria-label={look.label}>
						{look.icon}
					</span>
					<span className={s.temp}>{weather.temp}°</span>
					<span className={s.highLow}>
						H {weather.high}° · L {weather.low}°
					</span>
				</span>
			)}
		</div>
	);
}
