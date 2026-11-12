import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePhotos } from '../../lib/queries';
import { useScreenSaverSettings } from '../../lib/useScreenSaverSettings';
import { preload, slideSeconds } from '../../lib/photos';
import type { Photo } from '../../lib/types';
import s from './PhotoCard.module.css';
import { shuffle } from '../../lib/random';

/** A swipe: at least this far sideways, and more sideways than up or down. */
const SWIPE_PX = 40;
/** The ‹ › arrows fade out after this long without a touch on the card. */
const ARROWS_MS = 3000;
/** A tap: moved less than this. */
const TAP_PX = 10;

/** A photo, or a video playing muted (looping if it runs short of its turn). */
function Media({ photo, className }: { photo: Photo; className?: string }) {
	return photo.kind === 'video' ? (
		<video className={className} src={photo.url} poster={photo.thumbUrl} autoPlay muted loop playsInline />
	) : (
		<img className={className} src={photo.url} alt="" draggable={false} />
	);
}

/**
 * A carousel of the screen saver's photos (and videos, muted) under the week: it moves on by itself at the screen
 * saver's pace, and swipes or ‹ › step through by hand. A tap opens it big over the page (swipes, ‹ › and
 * the arrow keys still step through; it waits there instead of moving on). The ⋯ menu plays the screen
 * saver. Not shown until some photos are picked for it.
 */
export default function PhotoCard({ onPlay, className }: { onPlay: () => void; className?: string }) {
	const all = usePhotos().data;
	const photos = useMemo(() => (all ?? []).filter((p) => p.inSlideshow && p.ready), [all]);
	const order = useMemo(() => shuffle(photos), [photos]);
	const seconds = Math.max(8, useScreenSaverSettings()[0].seconds);
	const [at, setAt] = useState(0);
	// The photo before, fading out beneath the current one.
	const [under, setUnder] = useState<Photo | null>(null);
	const [menu, setMenu] = useState(false);
	// Open big, over the page.
	const [big, setBig] = useState(false);
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

	// On by itself (not while it's open big); stepping by hand starts the wait over.
	useEffect(() => {
		if (order.length < 2 || big) return;
		// A video plays through once (45 seconds at most).
		const timer = setTimeout(() => step(1), slideSeconds(order[at % order.length], seconds) * 1000);
		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [at, order, seconds, big]);

	// Open big: Escape closes it, the arrow keys step through.
	useEffect(() => {
		if (!big) return;
		const key = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setBig(false);
			else if (e.key === 'ArrowRight') stepRef.current(1);
			else if (e.key === 'ArrowLeft') stepRef.current(-1);
		};
		window.addEventListener('keydown', key);
		return () => window.removeEventListener('keydown', key);
	}, [big]);

	// A two-finger swipe on a trackpad comes as sideways scrolling: one photo per swipe (it counts
	// again once the fingers have rested), and it doesn't go Back in the browser.
	const stepRef = useRef(step);
	stepRef.current = step;
	const hasPhotos = order.length > 0;
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
		el.addEventListener('wheel', wheel, { passive: false });
		return () => {
			el.removeEventListener('wheel', wheel);
			clearTimeout(rest);
		};
	}, [hasPhotos]);

	// A tap anywhere else closes the menu.
	useEffect(() => {
		if (!menu) return;
		const close = (e: globalThis.PointerEvent) => {
			if (!card.current?.querySelector(`.${s.menu}`)?.contains(e.target as Node)) setMenu(false);
		};
		window.addEventListener('pointerdown', close);
		return () => window.removeEventListener('pointerdown', close);
	}, [menu]);

	/** A swipe steps; on the card, a tap on the photo (not its buttons) opens it big. */
	function up(e: PointerEvent, open: boolean) {
		const start = swipe.current;
		swipe.current = null;
		if (!start) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
		else if (open && Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX && !(e.target as Element).closest('button'))
			setBig(true);
	}

	if (!current) return null;
	return (
		<div
			ref={card}
			className={`${s.card} ${className ?? ''}`}
			role="region"
			aria-roledescription="carousel"
			aria-label="Photos"
			onPointerDown={(e) => {
				swipe.current = { x: e.clientX, y: e.clientY };
				wake();
			}}
			onPointerMove={(e) => e.pointerType === 'mouse' && wake()}
			onPointerUp={(e) => up(e, true)}
		>
			{under && under.id !== current.id && <Media key={under.id} photo={under} className={s.photo} />}
			<Media key={current.id} photo={current} className={`${s.photo} ${under ? s.fadeIn : ''}`} />
			{order.length > 1 && (
				<div className={`${s.arrows} ${arrows ? s.awake : ''}`}>
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
			{big &&
				createPortal(
					// Over the whole page: the photo in a rounded frame with a see-through border, ‹ › and ✕. A tap
					// on the border closes it.
					// (Its touches stop here: React would pass them on to the card it's drawn from.)
					<div
						className={s.big}
						role="dialog"
						aria-modal="true"
						aria-label="Photo"
						onPointerDown={(e) => {
							e.stopPropagation();
							swipe.current = { x: e.clientX, y: e.clientY };
						}}
						onPointerMove={(e) => e.stopPropagation()}
						onPointerUp={(e) => {
							e.stopPropagation();
							up(e, false);
						}}
						onClick={(e) => e.target === e.currentTarget && setBig(false)}
					>
						<div className={s.bigFrame}>
							<Media key={current.id} photo={current} className={s.bigPhoto} />
							{order.length > 1 && (
								<>
									<button className={`${s.step} ${s.prev}`} onClick={() => step(-1)} aria-label="Previous photo">
										‹
									</button>
									<button className={`${s.step} ${s.next}`} onClick={() => step(1)} aria-label="Next photo">
										›
									</button>
								</>
							)}
							<button className={s.bigClose} onClick={() => setBig(false)} aria-label="Close">
								✕
							</button>
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
