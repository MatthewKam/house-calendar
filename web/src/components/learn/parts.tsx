import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import s from "../../styles/Learn.module.css";
import sheet from "../../styles/Sheet.module.css";

/** The game being played, for its How to play: its name, and how to play it, for a grown-up to explain. */
export const HowTo = createContext<{ title: string; how: string[] } | null>(null);

/** How far through: a dot per round, filled once done. */
export function Dots({ total, done }: { total: number; done: number }) {
	return (
		<div className={s.dots} role="img" aria-label={`${done} of ${total} done`}>
			{Array.from({ length: total }, (_, i) => (
				<span key={i} className={`${s.dot} ${i < done ? s.dotOn : ""}`} />
			))}
		</div>
	);
}

/**
 * A game, over the whole screen (no nav or name switches to bump): back to the games, How to play (for a
 * grown-up), how far through, then the game in the space left, which `children` gets the size of.
 */
export function Board({ onBack, total, done, children, cheer, style }: {
	onBack: () => void;
	total?: number;
	done?: number;
	children: (box: Box) => ReactNode;
	/** A round just got: the cheer shows over the game ("slide": the mascot slides across instead). */
	cheer?: boolean | "slide";
	style?: CSSProperties;
}) {
	const howTo = useContext(HowTo);
	const [showHow, setShowHow] = useState(false);
	const [stage, box] = useBox();
	return (
		<section className={s.board} style={style}>
			<div className={s.top}>
				<button type="button" className={s.back} onClick={onBack} aria-label="Back to the games">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M15 5l-7 7 7 7" />
					</svg>
				</button>
				{howTo && <button type="button" className={s.howLink} onClick={() => setShowHow(true)}>How to play</button>}
				{total !== undefined && <Dots total={total} done={done ?? 0} />}
			</div>
			<div ref={stage} className={s.stage}>
				{box.w > 0 && children(box)}
			</div>
			{cheer && <Cheer slide={cheer === "slide"} />}
			{showHow && howTo && <HowToPlay {...howTo} onClose={() => setShowHow(false)} />}
		</section>
	);
}

export interface Box { w: number; h: number }

/** An element's size, kept up to date as the screen turns or resizes. */
export function useBox() {
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
export function fit(n: number, box: Box, { gap = 12, shape = 1, most = 260 }: { gap?: number; shape?: number; most?: number } = {}) {
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

/** How long the mascot takes to slide across (a game's rounds wait this long before the next). */
export const SLIDE_MS = 2600;

/**
 * A big cheer when a round's got: the mascot pops up with a burst of confetti; or (`slide`) slides
 * across from left to right, wiping the game clean, with confetti all the way. No sound.
 */
export function Cheer({ slide }: { slide?: boolean }) {
	return (
		<div className={`${s.cheer} ${slide ? s.cheerSlide : ""}`} aria-hidden="true" style={{ "--slide": `${SLIDE_MS}ms` } as CSSProperties}>
			<span className={s.confetti}>
				{Array.from({ length: slide ? 24 : 14 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}
			</span>
			<img className={s.cheerMascot} src="/mascot/sprig.png" alt="" />
		</div>
	);
}

/** How to play a game, for a grown-up to explain to the kid (the games themselves never talk). */
function HowToPlay({ title, how, onClose }: { title: string; how: string[]; onClose: () => void }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);
	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<div className={`${sheet.sheet} ${sheet.confirm}`} role="dialog" aria-modal="true" aria-label={`How to play ${title}`}>
				<div className={s.howHead}>
					<img className={s.howMascot} src="/mascot/sprig-inky.png" alt="" />
					<h2 className={sheet.heading}>{title}</h2>
				</div>
				<ul className={s.howList}>
					{how.map((line) => <li key={line}>{line}</li>)}
				</ul>
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.primary} onClick={onClose}>Got it</button>
				</div>
			</div>
		</>
	);
}

/** A big play button, to hear it again (they can't read the words yet). */
export function Hear({ onTap, label = "Hear it again", size = 88 }: { onTap: () => void; label?: string; size?: number }) {
	return (
		<button type="button" className={s.hear} style={{ width: size, height: size }} onClick={onTap} aria-label={label}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M8 5.5v13l10.5-6.5z" />
			</svg>
		</button>
	);
}
