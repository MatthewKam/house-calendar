import { useEffect, useRef, useState, type PointerEvent } from "react";
import { fromDayKey } from "../lib/dates";
import { sky } from "../lib/weather";
import type { Weather } from "../lib/types";
import s from "../styles/Today.module.css";

type Hour = Weather["hours"][number];

/** "5 PM". */
const hourLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric" });

/**
 * The grown-ups' Today weather: now (how warm it feels, the sky, the day's high and low, rain and wind),
 * the hours around now as a line (a dot where now is; tap the line for an hour's details), then the rest
 * of the week, a day to a cell.
 */
export default function ForecastCard({ weather: w }: { weather: Weather }) {
	const now = sky(w.code, w.isDay);
	// Day or night for an hour: between today's sunrise and sunset, by the clock.
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
			{w.hours.length > 1 && <HourGraph hours={w.hours} isDay={isDay} />}
			<ul className={s.week} aria-label="The rest of the week">
				{w.days.slice(1).map((d) => {
					const look = sky(d.code, true);
					return (
						<li key={d.date} className={s.weekDay}>
							<span className={s.weekName}>
								{fromDayKey(d.date).toLocaleDateString([], { weekday: "long" })}
								<span className={s.weekIcon} role="img" aria-label={look.label}>{look.icon}</span>
							</span>
							<span className={s.weekMore}>
								<span aria-label={`${d.rain}% chance of rain`}>💧 {d.rain}%</span>
								<span aria-label={`wind up to ${d.wind} mph`}>💨 {d.wind} mph</span>
							</span>
							<span className={s.weekTemps}>
								{d.high}° <span className={s.weekLow}>/ {d.low}°</span>
							</span>
							<span className={s.weekFeels}>
								Feels {d.feelsHigh}° / {d.feelsLow}°
							</span>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

/** The graph's height, and room above the line (the high's label), below it (the hours) and at the sides. */
const HEIGHT = 130;
const TOP = 22;
const BOTTOM = 24;
const SIDE = 14;

/**
 * The hours around now as a line of temperatures: the hours gone by faint, a dot where now is, every third
 * hour named underneath, and the high and low labelled (above their points). Tap (or point at) the line for an hour: when, the
 * temperature, how warm it feels, the sky, and the chance of rain when there is one.
 */
function HourGraph({ hours, isDay }: { hours: Hour[]; isDay: (iso: string) => boolean }) {
	const box = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [picked, setPicked] = useState<number | null>(null);
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const watch = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
		watch.observe(el);
		return () => watch.disconnect();
	}, []);

	const temps = hours.map((h) => h.temp);
	const hi = Math.max(...temps);
	const lo = Math.min(...temps);
	const span = Math.max(hi - lo, 4);
	const x = (i: number) => SIDE + (i * (width - 2 * SIDE)) / (hours.length - 1);
	const y = (t: number) => TOP + 6 + ((hi - t) / span) * (HEIGHT - TOP - BOTTOM - 10);
	const points = hours.map((h, i) => [x(i), y(h.temp)] as const);

	// Now, between two hours on the line.
	const times = hours.map((h) => Date.parse(h.time));
	const nowMs = Date.now();
	const after = times.findIndex((t) => t > nowMs);
	const at = after === 0 ? 0 : after < 0 ? hours.length - 1 : after - 1 + (nowMs - times[after - 1]) / (times[after] - times[after - 1]);
	const whole = Math.min(Math.floor(at), hours.length - 1);
	const part = at - whole;
	const nowPoint = [
		x(at),
		whole + 1 < hours.length ? y(hours[whole].temp + (hours[whole + 1].temp - hours[whole].temp) * part) : y(hours[whole].temp),
	] as const;
	const line = (ps: (readonly [number, number])[]) =>
		ps.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
	// Labels near an edge lean in, so they're not cut off.
	const anchor = (px: number) => (px < 20 ? "start" : px > width - 20 ? "end" : "middle");
	const hiAt = temps.indexOf(hi);
	const loAt = temps.lastIndexOf(lo);

	// The hour nearest a touch.
	const pick = (e: PointerEvent<SVGSVGElement>) => {
		const left = e.currentTarget.getBoundingClientRect().left;
		const i = Math.round(((e.clientX - left - SIDE) / (width - 2 * SIDE)) * (hours.length - 1));
		return Math.max(0, Math.min(hours.length - 1, i));
	};
	const shown = picked === null ? null : hours[picked];
	const look = shown && sky(shown.code, isDay(shown.time));

	return (
		<div ref={box} className={s.graph}>
			{width > 0 && (
				<svg width={width} height={HEIGHT} role="img"
					aria-label={`Temperatures from ${hourLabel(hours[0].time)} to ${hourLabel(hours[hours.length - 1].time)}: high ${hi}°, low ${lo}°`}
					onPointerDown={(e) => {
						const i = pick(e);
						// The same hour tapped again: put it away.
						setPicked((was) => (was === i && e.pointerType !== "mouse" ? null : i));
					}}
					onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && setPicked(pick(e))}
					onPointerLeave={(e) => e.pointerType === "mouse" && setPicked(null)}>
					{/* Every third hour, named along the bottom, with a faint line up. */}
					{hours.map((h, i) =>
						new Date(h.time).getHours() % 3 === 0 ? (
							<g key={h.time}>
								<line className={s.graphTick} x1={x(i)} x2={x(i)} y1={TOP} y2={HEIGHT - BOTTOM} />
								<text className={s.graphHour} x={x(i)} y={HEIGHT - 6} textAnchor={anchor(x(i))}>{hourLabel(h.time)}</text>
							</g>
						) : null,
					)}
					{/* Gone by, faint; ahead, solid. */}
					<path className={s.graphPast} d={line([...points.slice(0, whole + 1), nowPoint])} />
					<path className={s.graphLine} d={line([nowPoint, ...points.slice(whole + 1)])} />
					{/* The high and the low. */}
					<text className={s.graphTemp} x={points[hiAt][0]} y={points[hiAt][1] - 9} textAnchor={anchor(points[hiAt][0])}>{hi}°</text>
					{loAt !== hiAt && (
						<text className={s.graphTemp} x={points[loAt][0]} y={points[loAt][1] - 9} textAnchor={anchor(points[loAt][0])}>{lo}°</text>
					)}
					{/* An hour picked: a line down through it, and its point. */}
					{picked !== null && (
						<g>
							<line className={s.graphCross} x1={points[picked][0]} x2={points[picked][0]} y1={TOP - 4} y2={HEIGHT - BOTTOM} />
							<circle className={s.graphPick} cx={points[picked][0]} cy={points[picked][1]} r={5} />
						</g>
					)}
					{/* Now. */}
					<circle className={s.graphNow} cx={nowPoint[0]} cy={nowPoint[1]} r={6} />
				</svg>
			)}
			{shown && look && (
				// Over the hour, kept inside the card.
				<div className={s.graphTip} role="status"
					style={{ left: Math.max(0, Math.min(width - 150, points[picked!][0] - 75)) }}>
					<b>{hourLabel(shown.time)}</b>
					<span>
						{shown.temp}° · Feels {shown.feels}°
					</span>
					<span>
						<span aria-hidden="true">{look.icon}</span> {look.label}
					</span>
					{shown.rain > 0 && <span>💧 {shown.rain}% rain</span>}
				</div>
			)}
			{/* Hidden while an hour's showing, but keeping its room, so the week under it stays put. */}
			<p className={s.graphHint} style={picked === null ? undefined : { visibility: "hidden" }}>
				Tap the line for an hour's weather
			</p>
		</div>
	);
}
