import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { api } from "../lib/api";
import { fromDayKey, longDate } from "../lib/dates";
import { sky } from "../lib/weather";
import type { Weather } from "../lib/types";
import { canFindHere, findHere, setHere, useWeatherHere } from "../lib/useWeatherHere";
import AddressInput from "./AddressInput";
import s from "../styles/Today.module.css";

type Hour = Weather["hours"][number];

/** "5 PM". */
const hourLabel = (iso: string) =>
	new Date(iso).toLocaleTimeString([], { hour: "numeric" });

/**
 * The grown-ups' Today weather: now (how warm it feels, the sky, the day's high and low, rain and wind),
 * the hours around now as a line (a dot where now is; tap the line for an hour's details), then the next
 * seven days (Week), folded away behind See next 7 days.
 */
export default function ForecastCard({ weather: w }: { weather: Weather }) {
	const now = sky(w.code, w.isDay);
	const [weekOpen, setWeekOpen] = useState(false);
	// Day or night for an hour: between today's sunrise and sunset, by the clock.
	const rise = new Date(w.sunrise).getHours();
	const set = new Date(w.sunset).getHours();
	const isDay = (iso: string) => {
		const h = new Date(iso).getHours();
		return h >= rise && h < set;
	};
	return (
		<section className={s.card} aria-label="Weather">
			<div className={s.weatherHead}>
				<h2 className={s.cardHead}>Weather</h2>
				<PlaceSwitch />
			</div>
			<div className={s.weatherNow}>
				<span className={s.weatherIcon} aria-hidden="true">
					{now.icon}
				</span>
				<span className={s.weatherTemp}>{w.temp}°</span>
				<span className={s.weatherFacts}>
					<b>Feels like {w.feels}°</b>
					<span>{now.label}</span>
					<span>
						High {w.high}° · Low {w.low}°
					</span>
					<span>
						<span className={s.nowrap}>💧 {w.rainChance}% rain</span> ·{" "}
						<span className={s.nowrap}>💨 {w.wind} mph</span>
					</span>
				</span>
			</div>
			{w.hours.length > 1 && <HourGraph hours={w.hours} isDay={isDay} />}
			<button type="button" className={s.weekToggle} aria-expanded={weekOpen} onClick={() => setWeekOpen(!weekOpen)}>
				{weekOpen ? "Hide next 7 days" : "See next 7 days"}
			</button>
			{weekOpen && <Week days={w.days.slice(1)} />}
		</section>
	);
}

/**
 * Home, Here or another place: the forecast at home, where this device is (it asks permission the first
 * time), or a town or address typed in (a trip being planned, family far away). Kept on this device;
 * everything here that shows the weather follows it.
 */
function PlaceSwitch() {
	const here = useWeatherHere();
	const [finding, setFinding] = useState(false);
	const [typing, setTyping] = useState(false);
	const [typed, setTyped] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const place = here?.name ? here : null;
	function goHere() {
		setFinding(true);
		setProblem(null);
		setTyping(false);
		findHere().then(
			(at) => setHere(at),
			(err: GeolocationPositionError) =>
				setProblem(err.code === err.PERMISSION_DENIED ? "Location is off for Sprig on this device" : "Couldn't find where you are"),
		).finally(() => setFinding(false));
	}
	function goPlace(e: FormEvent) {
		e.preventDefault();
		const q = typed.trim();
		if (!q) return;
		setFinding(true);
		setProblem(null);
		api.weatherPlace(q).then(
			// Named by its first part: "Honolulu, HI, USA" is Honolulu.
			(at) => { setHere({ ...at, name: q.split(",")[0].trim() }); setTyping(false); setTyped(""); },
			() => setProblem("Couldn't find that place"),
		).finally(() => setFinding(false));
	}
	const option = (on: boolean, label: string, pick: () => void) => (
		<button type="button" role="radio" aria-checked={on} className={s.placeOption} onClick={pick} disabled={finding}>
			{label}
		</button>
	);
	const onHere = !!here && !place;
	return (
		<>
			<div className={s.place}>
				<div className={s.placeSwitch} role="radiogroup" aria-label="Weather for">
					{option(!here && !typing && !finding, "🏠 Home", () => { setProblem(null); setTyping(false); setHere(null); })}
					{(canFindHere() || onHere) &&
						option(onHere && !typing, finding && !typing ? "📍 Finding…" : "📍 Here", goHere)}
					{/* The place picked shows its name; tapped again, another can be typed in. */}
					{option(!!place || typing, place ? `🔎 ${place.name}` : "🔎 Other", () => { setProblem(null); setTyping((t) => !t || !place); })}
				</div>
				{problem && <span className={s.placeProblem}>{problem}</span>}
			</div>
			{typing && (
				<form className={s.placeForm} onSubmit={goPlace}>
					<AddressInput value={typed} onChange={setTyped} placeholder="A town or address" label="Weather for a place" />
					<button type="submit" className={s.placeGo} disabled={finding || !typed.trim()}>
						{finding ? "Finding…" : "Show"}
					</button>
				</form>
			)}
		</>
	);
}

/** Rain worth a mention (%), likely rain (picked out), and wind worth a mention (mph). */
const RAIN_SHOWN = 30;
const RAIN_LIKELY = 50;
const WIND_SHOWN = 15;

/**
 * The next seven days, a row each: the day, its sky, how warm it feels, and rain and wind when they're
 * worth knowing; under that, its low to its high as a bar on one scale for the week (a warmer day sits
 * further right).
 */
function Week({ days }: { days: Weather["days"] }) {
	const top = Math.max(...days.map((d) => d.high));
	const bottom = Math.min(...days.map((d) => d.low));
	const span = Math.max(top - bottom, 1);
	const bar = (low: number, high: number) => ({
		left: `${((low - bottom) / span) * 100}%`,
		width: `max(${((high - low) / span) * 100}%, 0.5rem)`,
	});
	return (
		<ul className={s.week} aria-label="The next seven days">
			{days.map((d) => {
				const look = sky(d.code, true);
				const date = fromDayKey(d.date);
				return (
					<li
						key={d.date}
						className={s.weekDay}
						aria-label={`${longDate(date)}: ${look.label}, ${d.rain}% rain, high ${d.high}°, low ${d.low}°, wind ${d.wind} mph, feels like ${d.feelsHigh}° to ${d.feelsLow}°`}
					>
						<span className={s.weekTop} aria-hidden="true">
							<span className={s.weekName}>
								{date.toLocaleDateString([], { weekday: "short" })} <span className={s.weekDate}>{date.getDate()}</span>
							</span>
							<span className={s.weekIcon}>{look.icon}</span>
							<span className={s.weekExtra}>
								<span>Feels {d.feelsLow}–{d.feelsHigh}°</span>
								{d.rain >= RAIN_SHOWN && (
									<span className={d.rain >= RAIN_LIKELY ? s.weekWet : undefined}>💧 {d.rain}%</span>
								)}
								{d.wind >= WIND_SHOWN && <span>💨 {d.wind} mph</span>}
							</span>
						</span>
						<span className={s.weekLow} aria-hidden="true">{d.low}°</span>
						<span className={s.weekTrack} aria-hidden="true">
							<span className={s.weekBar} style={bar(d.low, d.high)} />
						</span>
						<span className={s.weekHigh} aria-hidden="true">{d.high}°</span>
					</li>
				);
			})}
		</ul>
	);
}

/** The graph's height, and room above the line (the high's label), below it (the hours) and at the sides. */
const HEIGHT = 130;
const TOP = 22;
const BOTTOM = 24;
const SIDE = 14;
/** The picked hour's details, this wide. */
const TIP = 150;

/**
 * The hours around now as a line of temperatures, and how warm they feel as a dashed line on the same
 * scale: the hours gone by faint, a dot where now is, every third
 * hour named underneath, and the high and low labelled (above their points). Tap (or point at) the line for an hour: when, the
 * temperature, how warm it feels, the sky, and the chance of rain when there is one.
 */
function HourGraph({
	hours,
	isDay,
}: {
	hours: Hour[];
	isDay: (iso: string) => boolean;
}) {
	const box = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [picked, setPicked] = useState<number | null>(null);
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const watch = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width),
		);
		watch.observe(el);
		return () => watch.disconnect();
	}, []);

	const temps = hours.map((h) => h.temp);
	const hi = Math.max(...temps);
	const lo = Math.min(...temps);
	// One scale for both lines, so the feels line sits above or below the temperature where it should.
	const feels = hours.map((h) => h.feels);
	const top = Math.max(hi, ...feels);
	const span = Math.max(top - Math.min(lo, ...feels), 4);
	const x = (i: number) => SIDE + (i * (width - 2 * SIDE)) / (hours.length - 1);
	const y = (t: number) =>
		TOP + 6 + ((top - t) / span) * (HEIGHT - TOP - BOTTOM - 10);
	const points = hours.map((h, i) => [x(i), y(h.temp)] as const);
	const feelsPoints = hours.map((h, i) => [x(i), y(h.feels)] as const);

	// Now, between two hours on the line.
	const times = hours.map((h) => Date.parse(h.time));
	const nowMs = Date.now();
	const after = times.findIndex((t) => t > nowMs);
	const at =
		after === 0
			? 0
			: after < 0
				? hours.length - 1
				: after -
					1 +
					(nowMs - times[after - 1]) / (times[after] - times[after - 1]);
	const whole = Math.min(Math.floor(at), hours.length - 1);
	const part = at - whole;
	// A value at now, between its two hours.
	const nowOf = (v: (h: Hour) => number) =>
		[
			x(at),
			whole + 1 < hours.length
				? y(v(hours[whole]) + (v(hours[whole + 1]) - v(hours[whole])) * part)
				: y(v(hours[whole])),
		] as const;
	const nowPoint = nowOf((h) => h.temp);
	const nowFeels = nowOf((h) => h.feels);
	const line = (ps: (readonly [number, number])[]) =>
		ps
			.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`)
			.join(" ");
	// Labels near an edge lean in, so they're not cut off.
	const anchor = (px: number) =>
		px < 20 ? "start" : px > width - 20 ? "end" : "middle";
	const hiAt = temps.indexOf(hi);
	const loAt = temps.lastIndexOf(lo);

	// The hour nearest a touch.
	const pick = (e: PointerEvent<SVGSVGElement>) => {
		const left = e.currentTarget.getBoundingClientRect().left;
		const i = Math.round(
			((e.clientX - left - SIDE) / (width - 2 * SIDE)) * (hours.length - 1),
		);
		return Math.max(0, Math.min(hours.length - 1, i));
	};
	const shown = picked === null ? null : hours[picked];
	const look = shown && sky(shown.code, isDay(shown.time));

	return (
		<div ref={box} className={s.graph}>
			{width > 0 && (
				<svg
					width={width}
					height={HEIGHT}
					role="img"
					aria-label={`Temperatures from ${hourLabel(hours[0].time)} to ${hourLabel(hours[hours.length - 1].time)}: high ${hi}°, low ${lo}°`}
					onPointerDown={(e) => {
						const i = pick(e);
						// The same hour tapped again: put it away.
						setPicked((was) =>
							was === i && e.pointerType !== "mouse" ? null : i,
						);
					}}
					onPointerMove={(e) =>
						(e.pointerType === "mouse" || e.buttons) && setPicked(pick(e))
					}
					onPointerLeave={(e) => e.pointerType === "mouse" && setPicked(null)}
				>
					{/* Every third hour, named along the bottom, with a faint line up. */}
					{hours.map((h, i) =>
						new Date(h.time).getHours() % 3 === 0 ? (
							<g key={h.time}>
								<line
									className={s.graphTick}
									x1={x(i)}
									x2={x(i)}
									y1={TOP}
									y2={HEIGHT - BOTTOM}
								/>
								<text
									className={s.graphHour}
									x={x(i)}
									y={HEIGHT - 6}
									textAnchor={anchor(x(i))}
								>
									{hourLabel(h.time)}
								</text>
							</g>
						) : null,
					)}
					{/* How warm it feels, dashed, under the temperature line: gone by, fainter. */}
					<path
						className={`${s.graphFeels} ${s.graphFeelsPast}`}
						d={line([...feelsPoints.slice(0, whole + 1), nowFeels])}
					/>
					<path
						className={s.graphFeels}
						d={line([nowFeels, ...feelsPoints.slice(whole + 1)])}
					/>
					{/* Gone by, faint; ahead, solid. */}
					<path
						className={s.graphPast}
						d={line([...points.slice(0, whole + 1), nowPoint])}
					/>
					<path
						className={s.graphLine}
						d={line([nowPoint, ...points.slice(whole + 1)])}
					/>
					{/* The high and the low. */}
					<text
						className={s.graphTemp}
						x={points[hiAt][0]}
						y={points[hiAt][1] - 9}
						textAnchor={anchor(points[hiAt][0])}
					>
						{hi}°
					</text>
					{loAt !== hiAt && (
						<text
							className={s.graphTemp}
							x={points[loAt][0]}
							y={points[loAt][1] - 9}
							textAnchor={anchor(points[loAt][0])}
						>
							{lo}°
						</text>
					)}
					{/* An hour picked: a line down through it, and its point on each line. */}
					{picked !== null && (
						<g>
							<line
								className={s.graphCross}
								x1={points[picked][0]}
								x2={points[picked][0]}
								y1={TOP - 4}
								y2={HEIGHT - BOTTOM}
							/>
							<circle
								className={s.graphPickFeels}
								cx={feelsPoints[picked][0]}
								cy={feelsPoints[picked][1]}
								r={4}
							/>
							<circle
								className={s.graphPick}
								cx={points[picked][0]}
								cy={points[picked][1]}
								r={5}
							/>
						</g>
					)}
					{/* Now. */}
					<circle
						className={s.graphNow}
						cx={nowPoint[0]}
						cy={nowPoint[1]}
						r={6}
					/>
				</svg>
			)}
			{shown && look && (
				// Beside the hour (its dots stay in sight): to the right in the first half, else the left.
				<div
					className={s.graphTip}
					role="status"
					style={{
						left: Math.max(0, Math.min(width - TIP,
							points[picked!][0] < width / 2 ? points[picked!][0] + 12 : points[picked!][0] - 12 - TIP)),
					}}
				>
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
			<p
				className={s.graphHint}
				style={picked === null ? undefined : { visibility: "hidden" }}
			>
				<span className={s.graphKey}>
					<svg width="18" height="6" aria-hidden="true"><line className={s.graphLine} x1="1" x2="17" y1="3" y2="3" /></svg>
					Temperature
				</span>
				<span className={s.graphKey}>
					<svg width="18" height="6" aria-hidden="true"><line className={s.graphFeels} x1="1" x2="17" y1="3" y2="3" /></svg>
					Feels like
				</span>
				<span>Tap for an hour</span>
			</p>
		</div>
	);
}
