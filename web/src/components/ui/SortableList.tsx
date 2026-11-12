import { useRef, useState, type PointerEvent, type ReactNode } from "react";

/** Props for the drag handle of one row. */
export interface HandleProps {
	onPointerDown: (e: PointerEvent<HTMLElement>) => void;
	onPointerMove: (e: PointerEvent<HTMLElement>) => void;
	onPointerUp: () => void;
	onPointerCancel: () => void;
	style: { touchAction: "none"; cursor: "grab" };
	"aria-label": string;
}

interface Props<T> {
	items: T[];
	getId: (item: T) => string;
	/** Called once, on drop, with the ids in their new order (only if it changed). */
	onReorder: (ids: string[]) => void;
	className?: string;
	draggingClass?: string;
	children: (item: T, handle: HandleProps) => ReactNode;
}

interface Drag {
	id: string;
	startY: number;
	from: number;
	to: number;
	rows: { el: HTMLElement; top: number; height: number }[];
	/** Distance the other rows move to make room: the dragged row's height plus the gap. */
	shift: number;
}

const SLIDE = "transform 160ms ease";

/**
 * A list whose rows can be dragged into a new order by their handle. The dragged row follows the
 * finger and the others slide aside to show where it will land. Built on pointer events (not HTML
 * drag-and-drop) so it works on the wall's touch screen, and it moves rows with CSS transforms
 * rather than re-rendering on every move, so it stays smooth.
 */
export default function SortableList<T>({ items, getId, onReorder, className, draggingClass, children }: Props<T>) {
	const list = useRef<HTMLUListElement>(null);
	const drag = useRef<Drag | null>(null);
	const [dragId, setDragId] = useState<string | null>(null);
	const ids = items.map(getId);

	function start(id: string, e: PointerEvent<HTMLElement>) {
		if (!list.current) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		const rows = ([...list.current.children] as HTMLElement[]).map((el) => {
			const r = el.getBoundingClientRect();
			return { el, top: r.top, height: r.height };
		});
		const from = ids.indexOf(id);
		const next = rows[from + 1] ?? rows[from - 1];
		const gap = next ? Math.abs(next.top - rows[from].top) - (next === rows[from + 1] ? rows[from].height : next.height) : 0;
		rows.forEach((r, i) => (r.el.style.transition = i === from ? "none" : SLIDE));
		drag.current = { id, startY: e.clientY, from, to: from, rows, shift: rows[from].height + Math.max(0, gap) };
		setDragId(id);
	}

	function move(e: PointerEvent<HTMLElement>) {
		const d = drag.current;
		if (!d) return;
		const dy = e.clientY - d.startY;
		const me = d.rows[d.from];
		me.el.style.transform = `translateY(${dy}px)`;
		// Its new place: after every other row whose middle is above the dragged row's middle.
		const middle = me.top + me.height / 2 + dy;
		let to = 0;
		d.rows.forEach((r, i) => {
			if (i !== d.from && middle > r.top + r.height / 2) to++;
		});
		if (to === d.to) return;
		d.to = to;
		// Rows between the old and new place slide up or down by one row to make room.
		d.rows.forEach((r, i) => {
			if (i === d.from) return;
			const y = d.from < to && i > d.from && i <= to ? -d.shift : d.from > to && i >= to && i < d.from ? d.shift : 0;
			r.el.style.transform = y ? `translateY(${y}px)` : "";
		});
	}

	function end(commit: boolean) {
		const d = drag.current;
		if (!d) return;
		drag.current = null;
		// Snap everything back without animating; the list re-renders in its new order at the same time.
		d.rows.forEach((r) => {
			r.el.style.transition = "none";
			r.el.style.transform = "";
		});
		requestAnimationFrame(() => d.rows.forEach((r) => (r.el.style.transition = "")));
		setDragId(null);
		if (commit && d.to !== d.from) {
			const order = ids.filter((x) => x !== d.id);
			order.splice(d.to, 0, d.id);
			onReorder(order);
		}
	}

	return (
		<ul ref={list} className={className}>
			{items.map((item) => {
				const id = getId(item);
				return (
					<li key={id} data-id={id} className={dragId === id ? draggingClass : undefined}>
						{children(item, {
							onPointerDown: (e) => start(id, e),
							onPointerMove: move,
							onPointerUp: () => end(true),
							onPointerCancel: () => end(false),
							style: { touchAction: "none", cursor: "grab" },
							"aria-label": "Drag to reorder",
						})}
					</li>
				);
			})}
		</ul>
	);
}
