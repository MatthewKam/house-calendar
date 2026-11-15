import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { pageNumbers } from '../../lib/pages';
import s from './Recipes.module.css';

/** How many recipes are a page: fewer of the big cards, more of the list. */
export const PAGE_SIZE = { cards: 12, rows: 20, list: 30 } as const;

/**
 * The recipes a page at a time: scrolling to the end brings the next page under it, and the page menu (‹ 1 2
 * 3 ›, staying at the top while scrolling) jumps to a page, the ones before it put away. Given a fresh `key`
 * when the filters or the view change, so it starts again at page 1.
 */
export default function RecipePages<T extends { id: string }>({
	items,
	size,
	scroller,
	listClass,
	render,
}: {
	items: T[];
	size: number;
	/** The scrolling area the list is in. */
	scroller: RefObject<HTMLDivElement | null>;
	listClass: string;
	render: (item: T) => ReactNode;
}) {
	const count = Math.ceil(items.length / size);
	// The pages showing: from `first` to `last`.
	const [first, setFirst] = useState(0);
	const [last, setLast] = useState(0);
	// The page on screen (the topmost one showing).
	const [current, setCurrent] = useState(0);
	const end = useRef<HTMLDivElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const menu = useRef<HTMLElement>(null);

	// Near the end: the next page.
	useEffect(() => {
		const root = scroller.current;
		const mark = end.current;
		if (!root || !mark || last >= count - 1) return;
		const watch = new IntersectionObserver(
			(seen) => {
				if (seen.some((x) => x.isIntersecting)) setLast((l) => Math.min(l + 1, count - 1));
			},
			{ root, rootMargin: '0px 0px 300px 0px' },
		);
		watch.observe(mark);
		return () => watch.disconnect();
	}, [scroller, last, count]);

	// Which page is at the top of the screen, for the menu.
	useEffect(() => {
		const root = scroller.current;
		if (!root) return;
		const onScroll = () => {
			const top = root.getBoundingClientRect().top + (menu.current?.offsetHeight ?? 0);
			const rows = [...(list.current?.children ?? [])] as HTMLElement[];
			const at = rows.findIndex((el) => el.getBoundingClientRect().bottom > top);
			if (at >= 0) setCurrent(first + Math.floor(at / size));
		};
		onScroll();
		root.addEventListener('scroll', onScroll, { passive: true });
		return () => root.removeEventListener('scroll', onScroll);
	}, [scroller, first, size, last]);

	const go = (page: number) => {
		setFirst(page);
		setLast(page);
		setCurrent(page);
		// The page's top, under the filters.
		requestAnimationFrame(() => {
			const root = scroller.current;
			const at = menu.current ?? list.current;
			if (root && at) root.scrollTop += at.getBoundingClientRect().top - root.getBoundingClientRect().top;
		});
	};

	const from = first * size;
	const to = Math.min((last + 1) * size, items.length);
	return (
		<>
			{count > 1 && (
				<nav className={s.pager} aria-label="Pages" ref={menu}>
					<span className={s.pagerCount}>
						{from + 1}–{to} of {items.length}
					</span>
					<span className={s.pagerPages}>
						<button
							type="button"
							className={s.pagerButton}
							aria-label="Page before"
							disabled={current === 0}
							onClick={() => go(current - 1)}
						>
							‹
						</button>
						{pageNumbers(count, current).map((p, i) =>
							p === null ? (
								<span key={`gap${i}`} className={s.pagerGap} aria-hidden="true">
									…
								</span>
							) : (
								<button
									key={p}
									type="button"
									className={s.pagerButton}
									aria-label={`Page ${p + 1}`}
									aria-current={p === current ? 'page' : undefined}
									onClick={() => go(p)}
								>
									{p + 1}
								</button>
							),
						)}
						<button
							type="button"
							className={s.pagerButton}
							aria-label="Next page"
							disabled={current >= count - 1}
							onClick={() => go(current + 1)}
						>
							›
						</button>
					</span>
				</nav>
			)}
			<ul className={listClass} ref={list}>
				{items.slice(from, to).map((item) => (
					<li key={item.id}>{render(item)}</li>
				))}
			</ul>
			{/* Reached: the next page comes. */}
			<div ref={end} aria-hidden="true" />
			{last < count - 1 && <p className={s.pagerMore}>Scroll for more</p>}
		</>
	);
}
