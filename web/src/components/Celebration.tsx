import { useEffect, useRef } from "react";
import type { Cheer } from "../lib/useCheer";
import s from "../styles/Celebration.module.css";

const COLORS = ["#f6c445", "#ef6f6c", "#4ea8de", "#5cc28a", "#b48ae6", "#f59e4c", "#ff8fc7"];

/** Confetti falling from the top of the screen for a few seconds (drawn on a canvas, so it stays smooth). */
function Confetti() {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const c = canvas.current!;
		const ctx = c.getContext("2d")!;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const w = (c.width = innerWidth * dpr);
		const h = (c.height = innerHeight * dpr);
		// Lots: about one piece per 2px of width (up to 600), arriving in waves from above the screen.
		const pieces = Array.from({ length: Math.round(Math.min(600, innerWidth / 2)) }, () => ({
			x: Math.random() * w,
			y: -Math.random() * h * 1.2,
			vx: (Math.random() - 0.5) * 3 * dpr,
			vy: (2 + Math.random() * 4) * dpr,
			size: (6 + Math.random() * 8) * dpr,
			spin: Math.random() * Math.PI,
			vspin: (Math.random() - 0.5) * 0.3,
			color: COLORS[Math.floor(Math.random() * COLORS.length)],
			round: Math.random() < 0.3,
		}));
		let frame = 0;
		let raf = 0;
		const draw = () => {
			ctx.clearRect(0, 0, w, h);
			for (const p of pieces) {
				p.x += p.vx + Math.sin((frame + p.y) / 30) * 0.6 * dpr;
				p.y += p.vy;
				p.spin += p.vspin;
				ctx.save();
				ctx.translate(p.x, p.y);
				ctx.rotate(p.spin);
				ctx.fillStyle = p.color;
				// Flutter: pieces turn edge-on and back as they fall.
				const flat = Math.abs(Math.cos(p.spin * 2));
				if (p.round) {
					ctx.beginPath();
					ctx.ellipse(0, 0, p.size / 2, (p.size / 2) * flat + 1, 0, 0, Math.PI * 2);
					ctx.fill();
				} else {
					ctx.fillRect(-p.size / 2, (-p.size / 3) * flat, p.size, (p.size / 1.5) * flat + 1);
				}
				ctx.restore();
			}
			frame++;
			if (pieces.some((p) => p.y < h + 40)) raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, []);
	return <canvas ref={canvas} className={s.confetti} aria-hidden="true" />;
}

/**
 * The big "Hooray!" when a kid finishes all of today's daily tasks or fills a reward jar: confetti,
 * their name and what for, for a few seconds (a tap closes it sooner).
 */
export default function Celebration({ cheer: { names, emoji, message }, onDone }: { cheer: Cheer; onDone: () => void }) {
	const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	useEffect(() => {
		const t = setTimeout(onDone, 5000);
		// A happy buzz, on phones that can (Android; iPhones don't let web apps vibrate).
		navigator.vibrate?.([80, 60, 80, 60, 160]);
		return () => clearTimeout(t);
	}, [onDone]);
	const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
	return (
		<div className={s.overlay} onClick={onDone} role="alert">
			<div className={s.card}>
				<div className={s.emoji} aria-hidden="true">
					{emoji}
				</div>
				<div className={s.hooray}>Hooray, {who}!</div>
				<div className={s.sub}>{message}</div>
			</div>
			{/* After the card, so it falls in front of it. */}
			{!calm && <Confetti />}
		</div>
	);
}
