import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type PointerEvent,
} from "react";
import {
	useMembers,
	useRangeEvents,
	useTravelTimes,
	useWeather,
} from "../lib/queries";
import { eventPaint, eventsOn } from "../lib/events";
import { sky } from "../lib/weather";
import { isNight, TRANSITIONS } from "../lib/screensaver";
import type { CalEvent, Photo, ScreenSaverSettings } from "../lib/types";
import { preload, slideSeconds } from "../lib/photos";
import { dayKey, driveLabel, fromDayKey, timeLabel } from "../lib/dates";
import s from "../styles/ScreenSaver.module.css";

type Effect = Exclude<ScreenSaverSettings["transition"], "mix"> | "slideBack";
const EFFECTS = TRANSITIONS.map((t) => t.id).filter(
	(t): t is Exclude<ScreenSaverSettings["transition"], "mix"> => t !== "mix",
);
/** Today's events listed in the corner before the rest become "+N more". */
const MAX_EVENTS = 5;
/** How long a photo takes to come in (and the last to go). */
const SWAP_MS = 1600;
/** A swipe: at least this far sideways, and more sideways than up or down. */
const SWIPE_PX = 60;

interface Slide {
	photo: Photo;
	effect: Effect;
	/** Ken Burns: where the slow zoom drifts toward. */
	origin: string;
	key: number;
}

function shuffle<T>(list: T[]) {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * Full-screen photos while the wall is idle, each for `seconds`, coming in with a transition. The
 * time and weather sit in a corner. Swipe for the next or previous photo; the small pause button
 * holds the current one and shows ‹ › to step through. Any other tap closes it (and doesn't reach
 * the page beneath).
 */
export default function ScreenSaver({
	photos,
	settings,
	onClose,
	onOpenEvent,
}: {
	photos: Photo[];
	settings: ScreenSaverSettings;
	onClose: () => void;
	/** One of today's events was tapped: open it on the calendar. */
	onOpenEvent: (event: CalEvent, day: string) => void;
}) {
	const weather = useWeather().data;
	const calm = useMemo(
		() => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		[],
	);
	const order = useRef<Photo[]>([]);
	// Photos shown so far, so Previous can go back; `at` is the one on screen.
	const history = useRef<Photo[]>([]);
	const at = useRef(-1);
	const counter = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const swipe = useRef<{ x: number; y: number } | null>(null);
	const swiped = useRef(false);
	const [slides, setSlides] = useState<Slide[]>([]);
	const [paused, setPaused] = useState(false);
	const pausedRef = useRef(false);
	const [now, setNow] = useState(() => new Date());

	const pickEffect = (): Effect =>
		calm
			? "fade"
			: settings.transition === "mix"
				? EFFECTS[Math.floor(Math.random() * EFFECTS.length)]
				: settings.transition;

	/** Puts a photo up; the one before leaves once it's in. */
	async function show(photo: Photo, effect: Effect) {
		await preload(photo);
		const origin = `${[20, 50, 80][Math.floor(Math.random() * 3)]}% ${[25, 50, 75][Math.floor(Math.random() * 3)]}%`;
		setSlides((old) => [
			...old.slice(-1),
			{ photo, effect, origin, key: ++counter.current },
		]);
		setTimeout(() => setSlides((old) => old.slice(-1)), SWAP_MS + 100);
	}

	/** Waits `seconds` and moves on, unless paused. */
	function schedule() {
		clearTimeout(timer.current);
		// A video plays through once; at night each photo stays up three times as long.
		const showing = history.current[at.current];
		const forPhoto = Math.max(5, settings.seconds) * (isNight(settings) ? 3 : 1);
		const seconds = showing ? slideSeconds(showing, forPhoto) : forPhoto;
		if (!pausedRef.current)
			timer.current = setTimeout(() => step(1, false), seconds * 1000);
	}

	/** One photo forward or back. Swipes and ‹ › slide the way you went; the timer uses the chosen transition. */
	function step(dir: 1 | -1, byHand: boolean) {
		if (dir === -1) {
			if (at.current <= 0) return;
			at.current--;
		} else {
			at.current++;
			if (at.current >= history.current.length) {
				if (!order.current.length) order.current = shuffle(photos);
				history.current.push(order.current.shift()!);
			}
		}
		void show(
			history.current[at.current],
			byHand && !calm ? (dir === 1 ? "slide" : "slideBack") : pickEffect(),
		);
		schedule();
	}

	function setPause(on: boolean) {
		pausedRef.current = on;
		setPaused(on);
		schedule();
	}

	useEffect(() => {
		step(1, false);
		return () => clearTimeout(timer.current);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [photos.length, settings.seconds, settings.transition]);

	// Keys: ← → step, Space pauses, Escape closes.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "ArrowRight") step(1, true);
			else if (e.key === "ArrowLeft") step(-1, true);
			else if (e.key === " ") {
				e.preventDefault();
				setPause(!pausedRef.current);
			} else if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 15_000);
		return () => clearInterval(t);
	}, []);

	function down(e: PointerEvent) {
		swipe.current = { x: e.clientX, y: e.clientY };
		swiped.current = false;
	}
	function up(e: PointerEvent) {
		const start = swipe.current;
		swipe.current = null;
		if (!start) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
			// Swipe left for the next photo, right for the one before.
			swiped.current = true;
			step(dx < 0 ? 1 : -1, true);
		}
	}
	// A plain tap closes it; a swipe or a control doesn't.
	const tap = () => {
		if (swiped.current) swiped.current = false;
		else onClose();
	};
	const control = (fn: () => void) => (e: React.MouseEvent) => {
		e.stopPropagation();
		fn();
	};

	const look = weather && sky(weather.code, weather.isDay);
	const last = slides.at(-1);
	// Today's events still to come (or going on now), for the corner.
	const day = fromDayKey(dayKey(now));
	const members = useMembers().data ?? [];
	const todays = eventsOn(useRangeEvents(day, 1).data ?? [], day).filter(
		(ev) => Date.parse(ev.end) > now.getTime(),
	);
	// The drive from home, for the ones with an address.
	const drives =
		useTravelTimes(todays.filter((ev) => ev.location).map((ev) => ev.id)).data ?? {};
	return (
		<div
			className={`${s.saver} ${isNight(settings, now) ? s.night : ""}`}
			onClick={tap}
			onPointerDown={down}
			onPointerUp={up}
			role="presentation"
			aria-label="Screen saver: tap to close"
		>
			{slides.map((slide) => {
				const leaving = slide !== last;
				return (
					<div
						key={slide.key}
						className={`${s.slide} ${s[`${slide.effect}${leaving ? "Out" : "In"}`] ?? ""}`}
						// The newest photo is on top of the one leaving.
						style={
							{
								zIndex: leaving ? 0 : 1,
								"--swap": `${SWAP_MS}ms`,
								"--show": `${settings.seconds + SWAP_MS / 1000 + 2}s`,
								"--origin": slide.origin,
							} as CSSProperties
						}
					>
						{/* A blurred copy fills the edges around photos that don't match the screen's shape. */}
						<div
							className={s.backdrop}
							style={{ backgroundImage: `url(${slide.photo.thumbUrl})` }}
						/>
						{slide.photo.kind === "video" ? (
							// Muted (so it can play by itself), from the start, looping if it runs short.
							<video className={s.photo} src={slide.photo.url} autoPlay muted loop playsInline />
						) : (
							<img
								className={`${s.photo} ${slide.effect === "kenburns" && !paused ? s.drift : ""}`}
								src={slide.photo.url}
								alt=""
								draggable={false}
							/>
						)}
					</div>
				);
			})}

			{/* Small and see-through, so it doesn't get in the way of the photos. */}
			<button
				className={`${s.pause} ${paused ? s.pauseOn : ""}`}
				onClick={control(() => setPause(!paused))}
				onPointerDown={(e) => e.stopPropagation()}
				aria-label={paused ? "Play" : "Pause"}
				title={paused ? "Play" : "Pause on this photo"}
			>
				{/* Drawn, so it's always two clear bars (a pause), never a square. */}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					{paused ? (
						<path d="M8 5.5v13l10.5-6.5z" />
					) : (
						<>
							<rect x="6.5" y="5" width="4" height="14" rx="1.3" />
							<rect x="13.5" y="5" width="4" height="14" rx="1.3" />
						</>
					)}
				</svg>
			</button>
			{paused && (
				<>
					<button
						className={`${s.step} ${s.prev}`}
						onClick={control(() => step(-1, true))}
						onPointerDown={(e) => e.stopPropagation()}
						disabled={at.current <= 0}
						aria-label="Previous photo"
					>
						‹
					</button>
					<button
						className={`${s.step} ${s.next}`}
						onClick={control(() => step(1, true))}
						onPointerDown={(e) => e.stopPropagation()}
						aria-label="Next photo"
					>
						›
					</button>
				</>
			)}

			<div className={s.corner}>
				<div className={s.cornerInfo}>
					<span className={s.time}>{timeLabel(now)}</span>
					<span className={s.date}>
						{now.toLocaleDateString([], {
							weekday: "long",
							month: "long",
							day: "numeric",
						})}
					</span>
					{weather && look && (
						<span className={s.weather}>
							<span>
								{look.icon} {weather.temp}°
							</span>
							{/* Today's high and low, and the humidity now. */}
							<span className={s.weatherMore}>
								H {weather.high}° · L {weather.low}°
								{weather.humidity != null && ` · RH ${weather.humidity}%`}
							</span>
						</span>
					)}
				</div>
				{settings.showEvents && todays.length > 0 && (
					<ul className={s.events} aria-label="Today's events">
						{todays
							.slice(
								0,
								todays.length > MAX_EVENTS ? MAX_EVENTS - 1 : MAX_EVENTS,
							)
							.map((ev) => (
								<li key={ev.id}>
									{/* Tap: back to the calendar with this event open. */}
									<button
										className={s.event}
										style={eventPaint(ev, members).vars as CSSProperties}
										onClick={control(() => onOpenEvent(ev, dayKey(day)))}
										onPointerDown={(e) => e.stopPropagation()}
									>
										<span className={s.eventTime}>
											{ev.allDay
												? "All day"
												: Date.parse(ev.start) < day.getTime()
													? `until ${timeLabel(ev.end)}`
													: timeLabel(ev.start)}
										</span>
										<span className={s.eventText}>
											<span className={s.eventTitle}>{ev.title}</span>
											{drives[ev.id] && (
												<span className={s.eventDrive}>
													{driveLabel(drives[ev.id])}
												</span>
											)}
										</span>
									</button>
								</li>
							))}
						{todays.length > MAX_EVENTS && (
							<li className={s.more}>
								+{todays.length - MAX_EVENTS + 1} more today
							</li>
						)}
					</ul>
				)}
			</div>
		</div>
	);
}
