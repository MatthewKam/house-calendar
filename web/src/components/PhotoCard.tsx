import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { usePhotos, useSettings } from "../lib/queries";
import { screenSaverSettings } from "../lib/screensaver";
import { preload, slideSeconds } from "../lib/photos";
import type { Photo } from "../lib/types";
import s from "../styles/PhotoCard.module.css";

/** A swipe: at least this far sideways, and more sideways than up or down. */
const SWIPE_PX = 40;
/** The ‹ › arrows fade out after this long without a touch on the card. */
const ARROWS_MS = 3000;

function shuffle<T>(list: T[]) {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** A photo, or a video playing muted (looping if it runs short of its turn). */
function Media({ photo, className }: { photo: Photo; className: string }) {
	return photo.kind === "video" ? (
		<video className={className} src={photo.url} poster={photo.thumbUrl} autoPlay muted loop playsInline />
	) : (
		<img className={className} src={photo.url} alt="" draggable={false} />
	);
}

/**
 * A carousel of the screen saver's photos (and videos, muted) under the week: it moves on by itself at the screen
 * saver's pace, and swipes or ‹ › step through by hand. The ⋯ menu plays the screen saver. Not
 * shown until some photos are picked for it.
 */
export default function PhotoCard({ onPlay }: { onPlay: () => void }) {
	const all = usePhotos().data;
	const photos = useMemo(() => (all ?? []).filter((p) => p.inSlideshow && p.ready), [all]);
	const order = useMemo(() => shuffle(photos), [photos]);
	const seconds = Math.max(8, screenSaverSettings(useSettings().data?.screensaver).seconds);
	const [at, setAt] = useState(0);
	// The photo before, fading out beneath the current one.
	const [under, setUnder] = useState<Photo | null>(null);
	const [menu, setMenu] = useState(false);
	const swipe = useRef<{ x: number; y: number } | null>(null);
	const card = useRef<HTMLDivElement>(null);
	const current = order.length ? order[at % order.length] : null;
	// The arrows show while the card is being used, then fade out.
	const [arrows, setArrows] = useState(false);
	const arrowsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	function wake() {
		setArrows(true);
		clearTimeout(arrowsTimer.current);
		arrowsTimer.current = setTimeout(() => setArrows(false), ARROWS_MS);
	}
	useEffect(() => () => clearTimeout(arrowsTimer.current), []);

	/** One photo forward or back, once it's loaded (so it never appears half-drawn). */
	function step(dir: 1 | -1) {
		if (order.length < 2) return;
		const next = (at + dir + order.length) % order.length;
		void preload(order[next]).then(() => {
			setUnder(order[at % order.length]);
			setAt(next);
		});
	}

	// On by itself; stepping by hand starts the wait over.
	useEffect(() => {
		if (order.length < 2) return;
		// A video plays through once (45 seconds at most).
		const timer = setTimeout(() => step(1), slideSeconds(order[at % order.length], seconds) * 1000);
		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [at, order, seconds]);

	// A two-finger swipe on a trackpad comes as sideways scrolling: one photo per swipe (it counts
	// again once the fingers have rested), and it doesn't go Back in the browser.
	const stepRef = useRef(step);
	stepRef.current = step;
	useEffect(() => {
		const el = card.current;
		if (!el) return;
		let sum = 0;
		let done = false;
		let rest: ReturnType<typeof setTimeout>;
		const wheel = (e: WheelEvent) => {
			if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
			e.preventDefault();
			clearTimeout(rest);
			rest = setTimeout(() => {
				sum = 0;
				done = false;
			}, 250);
			if (done) return;
			sum += e.deltaX;
			if (Math.abs(sum) >= 60) {
				done = true;
				stepRef.current(sum > 0 ? 1 : -1);
			}
		};
		el.addEventListener("wheel", wheel, { passive: false });
		return () => {
			el.removeEventListener("wheel", wheel);
			clearTimeout(rest);
		};
	}, [order.length > 0]);

	// A tap anywhere else closes the menu.
	useEffect(() => {
		if (!menu) return;
		const close = (e: globalThis.PointerEvent) => {
			if (!card.current?.querySelector(`.${s.menu}`)?.contains(e.target as Node)) setMenu(false);
		};
		window.addEventListener("pointerdown", close);
		return () => window.removeEventListener("pointerdown", close);
	}, [menu]);

	function up(e: PointerEvent) {
		const start = swipe.current;
		swipe.current = null;
		if (!start) return;
		const dx = e.clientX - start.x;
		if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - start.y)) step(dx < 0 ? 1 : -1);
	}

	if (!current) return null;
	return (
		<div
			ref={card}
			className={s.card}
			role="region"
			aria-roledescription="carousel"
			aria-label="Photos"
			onPointerDown={(e) => {
				swipe.current = { x: e.clientX, y: e.clientY };
				wake();
			}}
			onPointerMove={(e) => e.pointerType === "mouse" && wake()}
			onPointerUp={up}
		>
			{under && under.id !== current.id && <Media key={under.id} photo={under} className={s.photo} />}
			<Media key={current.id} photo={current} className={`${s.photo} ${under ? s.fadeIn : ""}`} />
			{order.length > 1 && (
				<div className={`${s.arrows} ${arrows ? s.awake : ""}`}>
					<button className={`${s.step} ${s.prev}`} onClick={() => step(-1)} aria-label="Previous photo">
						‹
					</button>
					<button className={`${s.step} ${s.next}`} onClick={() => step(1)} aria-label="Next photo">
						›
					</button>
				</div>
			)}
			<div className={s.menu}>
				<button className={s.more} onClick={() => setMenu(!menu)} aria-label="Photo actions" aria-expanded={menu}>
					⋯
				</button>
				{menu && (
					<div className={s.actions} role="menu">
						<button
							role="menuitem"
							onClick={() => {
								setMenu(false);
								onPlay();
							}}
						>
							▶ Play screen saver
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
