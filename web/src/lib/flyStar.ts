/**
 * A star pops out of `from` (the bucket's star), arcs over and plops into `to` (a jar's bar) at
 * `fill` (0 to 1) along it; the bar squashes a little as it lands, and `onLand` runs. Skipped when
 * the device asks for less motion; returns whether it flew.
 */
export function flyStar(from: Element | null, to: Element | null, fill: number, onLand: () => void) {
	if (!from || !to || matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
	const a = from.getBoundingClientRect();
	const b = to.getBoundingClientRect();
	const star = from.cloneNode(true) as HTMLElement;
	Object.assign(star.style, {
		position: "fixed",
		left: `${a.left}px`,
		top: `${a.top}px`,
		width: `${a.width}px`,
		height: `${a.height}px`,
		margin: "0",
		zIndex: "1000",
		pointerEvents: "none",
	});
	document.body.append(star);
	const dx = b.left + b.width * Math.min(1, Math.max(0, fill)) - (a.left + a.width / 2);
	const dy = b.top + b.height / 2 - (a.top + a.height / 2);
	// Up and out first, then down into the bar.
	star.animate(
		[
			{ transform: "translate(0, 0) scale(1) rotate(0deg)", easing: "cubic-bezier(.2,.8,.4,1)" },
			{ transform: `translate(${dx * 0.25}px, ${Math.min(dy, 0) - 48}px) scale(1.6) rotate(72deg)`, offset: 0.35, easing: "cubic-bezier(.5,0,.9,.5)" },
			{ transform: `translate(${dx}px, ${dy}px) scale(0.55) rotate(216deg)` },
		],
		{ duration: 700 },
	).onfinish = () => {
		star.remove();
		onLand();
		to.animate(
			[{ transform: "scale(1, 1)" }, { transform: "scale(1.04, 1.9)" }, { transform: "scale(1, 1)" }],
			{ duration: 280, easing: "ease-out" },
		);
	};
	from.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 250 });
	return true;
}
