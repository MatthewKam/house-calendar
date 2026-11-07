import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

/** A game's frame: back to the games, How to play (for a grown-up), how far through, then the game. */
export function Board({ onBack, total, done, children, className }: {
	onBack: () => void;
	total?: number;
	done?: number;
	children: ReactNode;
	className?: string;
}) {
	const howTo = useContext(HowTo);
	const [showHow, setShowHow] = useState(false);
	return (
		<section className={`${s.board} ${className ?? ""}`}>
			<div className={s.top}>
				<button type="button" className={s.back} onClick={onBack} aria-label="Back to the games">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M15 5l-7 7 7 7" />
					</svg>
				</button>
				{howTo && <button type="button" className={s.howLink} onClick={() => setShowHow(true)}>How to play</button>}
				{total !== undefined && <Dots total={total} done={done ?? 0} />}
			</div>
			{children}
			{showHow && howTo && <HowToPlay {...howTo} onClose={() => setShowHow(false)} />}
		</section>
	);
}

/** How to play a game, for a grown-up to explain to the kid (the games themselves don't explain out loud). */
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
export function Hear({ onTap, label = "Hear it again", big }: { onTap: () => void; label?: string; big?: boolean }) {
	return (
		<button type="button" className={`${s.hear} ${big ? s.hearBig : ""}`} onClick={onTap} aria-label={label}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M8 5.5v13l10.5-6.5z" />
			</svg>
		</button>
	);
}

/** Next, once the round's got (room kept for it, so nothing jumps). */
export function Next({ show, onNext, last }: { show: boolean; onNext: () => void; last: boolean }) {
	return (
		<div className={s.nextSpace}>
			{show && (
				<button type="button" className={s.next} onClick={onNext}>
					{last ? "Done!" : "Next"}
				</button>
			)}
		</div>
	);
}
