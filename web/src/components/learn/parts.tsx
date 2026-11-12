import {
	createContext,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from 'react';
import s from './Learn.module.css';
import sheet from '../ui/Sheet.module.css';
import Sheet from '../ui/Sheet';

/** The game being played, for its How to play: its name, and how to play it, for a grown-up to explain. */
export const HowTo = createContext<{ title: string; how: string[] } | null>(null);

/** How far through: a dot per round, filled once done. */
function Dots({ total, done }: { total: number; done: number }) {
	return (
		// Many (more than 8): smaller, so they still fit beside the back button on a phone.
		<div className={`${s.dots} ${total > 8 ? s.dotsMany : ''}`} role="img" aria-label={`${done} of ${total} done`}>
			{Array.from({ length: total }, (_, i) => (
				<span key={i} className={`${s.dot} ${i < done ? s.dotOn : ''}`} />
			))}
		</div>
	);
}

/**
 * A game, over the whole screen (no nav or name switches to bump): back to the games, How to play (for a
 * grown-up), how far through, then the game in the space left, which `children` gets the size of.
 */
export function Board({
	onBack,
	total,
	done,
	children,
	cheer,
	style,
}: {
	onBack: () => void;
	total?: number;
	done?: number;
	children: (box: Box) => ReactNode;
	/** A round just got: the cheer shows over the game ("slide": the mascot slides across instead; "fall":
	    it falls from the top). */
	cheer?: boolean | 'slide' | 'fall';
	style?: CSSProperties;
}) {
	const howTo = useContext(HowTo);
	const [showHow, setShowHow] = useState(false);
	const [stage, box] = useBox();
	useSettled();
	return (
		<section className={s.board} style={style}>
			<div className={s.top}>
				<button type="button" className={s.back} onClick={onBack} aria-label="Back to the games">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M15 5l-7 7 7 7" />
					</svg>
				</button>
				{howTo && (
					<button type="button" className={s.howLink} onClick={() => setShowHow(true)}>
						How to play
					</button>
				)}
				{total !== undefined && <Dots total={total} done={done ?? 0} />}
			</div>
			<div ref={stage} className={s.stage}>
				{box.w > 0 && children(box)}
			</div>
			{cheer && <Cheer move={cheer === true ? undefined : cheer} />}
			{showHow && howTo && <HowToPlay {...howTo} onClose={() => setShowHow(false)} />}
		</section>
	);
}

/**
 * While a game's open, the page behind it can't scroll, and it's put back at the top whenever the screen
 * turns or resizes. On an iPhone, a Home Screen app turned from landscape to portrait can be left scrolled
 * a little: the game still shows where it should, but taps land as if it hadn't moved, so nothing presses.
 * (iOS settles the new size late, so it's put back again a moment after.)
 */
function useSettled() {
	useEffect(() => {
		const html = document.documentElement;
		const before = html.style.overflow;
		html.style.overflow = 'hidden';
		const timers: ReturnType<typeof setTimeout>[] = [];
		const settle = () => {
			window.scrollTo(0, 0);
			timers.push(setTimeout(() => window.scrollTo(0, 0), 350));
		};
		settle();
		window.addEventListener('resize', settle);
		window.addEventListener('orientationchange', settle);
		window.visualViewport?.addEventListener('resize', settle);
		return () => {
			html.style.overflow = before;
			timers.forEach(clearTimeout);
			window.removeEventListener('resize', settle);
			window.removeEventListener('orientationchange', settle);
			window.visualViewport?.removeEventListener('resize', settle);
		};
	}, []);
}

export interface Box {
	w: number;
	h: number;
}

/** An element's size, kept up to date as the screen turns or resizes. */
function useBox() {
	const ref = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState<Box>({ w: 0, h: 0 });
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
		measure();
		const watch = new ResizeObserver(measure);
		watch.observe(el);
		return () => watch.disconnect();
	}, []);
	return [ref, box] as const;
}

/**
 * The biggest `n` things of a shape (width ÷ height) can be in a grid in a box: how many columns, how
 * many rows, and each one's width, at most `most` wide.
 */
export function fit(
	n: number,
	box: Box,
	{ gap = 12, shape = 1, most = 260 }: { gap?: number; shape?: number; most?: number } = {},
) {
	let best = { cols: 1, rows: n, size: 0 };
	for (let cols = 1; cols <= n; cols++) {
		const rows = Math.ceil(n / cols);
		const byWidth = (box.w - gap * (cols - 1)) / cols;
		const byHeight = ((box.h - gap * (rows - 1)) / rows) * shape;
		const size = Math.min(byWidth, byHeight, most);
		if (size > best.size) best = { cols, rows, size };
	}
	return { ...best, size: Math.max(0, Math.floor(best.size)) };
}

/** How long the mascot takes to slide across or fall (a game's rounds wait this long before the next). */
export const SLIDE_MS = 2600;

/**
 * A big cheer when a round's got: the mascot pops up with a burst of confetti; or slides across from
 * left to right (`slide`), or falls from the top with the confetti (`fall`), clearing the game away,
 * confetti all the way. No sound.
 */
export function Cheer({ move }: { move?: 'slide' | 'fall' }) {
	const slide = !!move;
	return (
		<div
			className={`${s.cheer} ${move === 'slide' ? s.cheerSlide : move === 'fall' ? s.cheerFall : ''}`}
			aria-hidden="true"
			style={{ '--slide': `${SLIDE_MS}ms` } as CSSProperties}
		>
			<span className={s.confetti}>
				{Array.from({ length: slide ? 28 : 18 }, (_, i) => (
					// Spread across the top, each falling at its own speed, drift and spin (the slide's keep coming).
					<i
						key={i}
						style={
							{
								'--i': i,
								'--x': `${(i * 37) % 100}%`,
								'--fall': `${1.3 + (i % 5) * 0.18}s`,
								'--wait': slide ? `${-(i * 0.11)}s` : `${(i % 7) * 0.06}s`,
								'--drift': `${((i % 3) - 1) * 3}rem`,
								'--spin': `${360 + i * 40}deg`,
							} as CSSProperties
						}
					/>
				))}
			</span>
			<img className={s.cheerMascot} src="/mascot/sprig.webp" alt="" />
		</div>
	);
}

/** How to play a game, for a grown-up to explain to the kid (the games themselves never talk). */
function HowToPlay({ title, how, onClose }: { title: string; how: string[]; onClose: () => void }) {
	return (
		<>
			<Sheet label={`How to play ${title}`} onClose={onClose} className={sheet.confirm}>
				<div className={s.howHead}>
					<img className={s.howMascot} src="/mascot/sprig-inky.webp" alt="" />
					<h2 className={sheet.heading}>{title}</h2>
				</div>
				<ul className={s.howList}>
					{how.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.primary} onClick={onClose}>
						Got it
					</button>
				</div>
			</Sheet>
		</>
	);
}

/**
 * A game's over: a pop-up over it, the mascot hopping, then play again or back to the games (a level up
 * says so, for a grown-up to read out). No `onAgain`: that was the day's last (only back).
 */
export function Over({
	title,
	note,
	onAgain,
	onBack,
}: {
	title: string;
	note?: string;
	onAgain?: () => void;
	onBack: () => void;
}) {
	return (
		<>
			<div className={sheet.scrim} role="presentation" />
			<div className={s.over} role="dialog" aria-modal="true" aria-label={title}>
				<img className={`${s.mascot} ${s.hop}`} src="/mascot/sprig.webp" alt="" />
				{/* The words and buttons: beside the mascot on a short screen, under it otherwise. */}
				<div className={s.overText}>
					<h2 className={s.overTitle}>{title}</h2>
					{note && <p className={s.note}>{note}</p>}
					<div className={s.overButtons}>
						{onAgain && (
							<button type="button" className={s.go} onClick={onAgain}>
								Play again
							</button>
						)}
						<button type="button" className={onAgain ? s.quiet : s.go} onClick={onBack}>
							Back to games
						</button>
					</div>
				</div>
			</div>
		</>
	);
}

/** A big play button, to hear it again (they can't read the words yet). */
export function Hear({
	onTap,
	label = 'Hear it again',
	size = 88,
}: {
	onTap: () => void;
	label?: string;
	size?: number;
}) {
	return (
		<button type="button" className={s.hear} style={{ width: size, height: size }} onClick={onTap} aria-label={label}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M8 5.5v13l10.5-6.5z" />
			</svg>
		</button>
	);
}
