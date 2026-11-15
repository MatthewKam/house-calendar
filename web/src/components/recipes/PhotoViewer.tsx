import { useEffect, useRef, useState, type TouchEvent } from 'react';
import s from './Recipes.module.css';

const MAX_ZOOM = 5;
/** The steps − and + go through. */
const STEPS = [1, 1.5, 2, 3, 4, 5];

/**
 * A photo, big, over everything: the whole of it to start (fitted to the screen), then zoomed with two
 * fingers, a double tap, the − and + buttons, or a trackpad's pinch, and moved around by scrolling while
 * zoomed. (The page itself can't be pinched: the app turns that off.) Grown-ups delete it from here.
 */
export default function PhotoViewer({
	url,
	onClose,
	onDelete,
}: {
	url: string;
	onClose: () => void;
	onDelete?: () => void;
}) {
	const stage = useRef<HTMLDivElement>(null);
	const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
	// The space under the bar the photo has to fit in.
	const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
	const [zoom, setZoom] = useState(1);
	const pinch = useRef<{ distance: number; zoom: number } | null>(null);
	const lastTap = useRef(0);

	useEffect(() => {
		const resize = () => {
			const el = stage.current;
			if (el) setView({ w: el.clientWidth, h: el.clientHeight });
		};
		resize();
		const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		window.addEventListener('resize', resize);
		window.addEventListener('keydown', key);
		return () => {
			window.removeEventListener('resize', resize);
			window.removeEventListener('keydown', key);
		};
	}, [onClose]);

	// The whole photo on the screen at 1×; bigger from there.
	const fit = natural ? Math.min(view.w / natural.w, view.h / natural.h, 1) : 1;
	const size = natural ? { width: natural.w * fit * zoom, height: natural.h * fit * zoom } : undefined;
	const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(1, z));
	const step = (dir: 1 | -1) =>
		setZoom((z) =>
			dir > 0 ? (STEPS.find((x) => x > z + 0.01) ?? MAX_ZOOM) : ([...STEPS].reverse().find((x) => x < z - 0.01) ?? 1),
		);

	const fingers = (e: TouchEvent) =>
		Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);

	return (
		<div className={s.viewer} role="dialog" aria-label="Photo">
			<div className={s.viewerBar}>
				<button type="button" className={s.viewerButton} onClick={onClose} aria-label="Close">
					×
				</button>
				<span className={s.spacer} />
				<button
					type="button"
					className={s.viewerButton}
					onClick={() => step(-1)}
					disabled={zoom <= 1}
					aria-label="Zoom out"
				>
					−
				</button>
				<span className={s.viewerZoom}>{Math.round(zoom * 100)}%</span>
				<button
					type="button"
					className={s.viewerButton}
					onClick={() => step(1)}
					disabled={zoom >= MAX_ZOOM}
					aria-label="Zoom in"
				>
					+
				</button>
				{onDelete && (
					<button type="button" className={s.viewerDelete} onClick={onDelete} aria-label="Delete this photo">
						Delete
					</button>
				)}
			</div>
			<div
				ref={stage}
				className={s.viewerStage}
				// A trackpad's pinch comes as a wheel with ctrl held.
				onWheel={(e) => {
					if (!e.ctrlKey) return;
					e.preventDefault();
					setZoom((z) => clamp(z * (1 - e.deltaY / 200)));
				}}
				onTouchStart={(e) => {
					if (e.touches.length === 2) pinch.current = { distance: fingers(e), zoom };
				}}
				onTouchMove={(e) => {
					if (e.touches.length !== 2 || !pinch.current) return;
					setZoom(clamp(pinch.current.zoom * (fingers(e) / pinch.current.distance)));
				}}
				onTouchEnd={(e) => {
					if (e.touches.length < 2) pinch.current = null;
				}}
				onClick={(e) => {
					// Double tap: in to 2×, or back to the whole photo.
					const now = Date.now();
					if (now - lastTap.current < 300) setZoom((z) => (z > 1 ? 1 : 2));
					lastTap.current = now;
					// A tap beside the photo (at 1×) closes it.
					if (e.target === e.currentTarget && zoom === 1) onClose();
				}}
			>
				<img
					src={url}
					alt=""
					style={size}
					draggable={false}
					onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
				/>
			</div>
		</div>
	);
}
