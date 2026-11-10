import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { fromDayKey, startOfWeek, timeLabel, longDate } from "../lib/dates";
import { api } from "../lib/api";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useNow } from "../lib/useNow";
import {
	useBuckets,
	useLearn,
	useMoments,
	usePotty,
	useRewards,
	useSetTaskDone,
	useTasks,
	useTasksDone,
} from "../lib/queries";
import { momentKind } from "../lib/moments";
import { didTask, dueOn, percent, taskProgress, tasksFor } from "../lib/tasks";
import type { Member, Task } from "../lib/types";
import { textOn } from "../lib/color";
import KidJars from "./KidJars";
import KidToday from "./KidToday";
import LearnTab from "./learn/LearnTab";
import { RewardsIcon, TasksIcon, TodayIcon } from "./NavBar";
import PinPad, { pinSheet } from "./PinPad";
import PottyCard from "./PottyCard";
import { StarIcon } from "./icons";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/KidMode.module.css";
import { firstName } from "../lib/people";
import Sheet from "./Sheet";

interface Props {
	today: string;
	/** The kids this screen is for: one, or several to switch between (a shared tablet). */
	kids: Member[];
	/** The kid it opens on (else the first). */
	startWith?: string;
	members: Member[];
	/** The corner button was held: a grown-up wants out. */
	onLeave: () => void;
	/** Putting stars in jars needs a guardian's PIN first (false: there's no PIN to ask for). */
	askPin: boolean;
}

/** Required tasks by part of the day, then goals: as on the Tasks page. */
/** Daily tasks in the order of the day: morning, anytime, then evening. */
const ORDER = { morning: 0, evening: 2 } as Record<string, number>;
const byTime = (a: Task, b: Task) => (ORDER[a.time ?? ""] ?? 1) - (ORDER[b.time ?? ""] ?? 1);


/** Learn: a lightbulb, drawn like the main nav's icons. */
const LearnIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
	</svg>
);

/** Kid mode's own tabs, with the main nav's icons. Learn shows once a guardian turns it on. */
type KidTab = "today" | "tasks" | "learn" | "rewards";
const TABS: { id: KidTab; Icon: () => ReactNode; label: string }[] = [
	{ id: "today", Icon: TodayIcon, label: "Today" },
	{ id: "tasks", Icon: TasksIcon, label: "Tasks" },
	{ id: "learn", Icon: LearnIcon, label: "Learn" },
	{ id: "rewards", Icon: RewardsIcon, label: "Rewards" },
];

/**
 * Kid mode: one kid's world as big pictures (ages 2–6 first), with its own tabs. Today: their
 * calendar (more days as they grow). Tasks: their tasks and goals to tap, and today's stickers.
 * Learn (when it's on): the day's activity. Rewards: their stars and jars. No settings or anyone else's things. Tapping a done task again
 * unticks it, so nothing can go wrong. A grown-up taps the corner button (and types a PIN) to leave.
 */
export default function KidMode({ today, kids, members, onLeave, askPin, startWith }: Props) {
	const [pickedId, setPickedId] = useState(kids.find((k) => k.id === startWith)?.id ?? kids[0]?.id ?? null);
	const kid = kids.find((k) => k.id === pickedId) ?? kids[0];
	const [picked, setTab] = useState<KidTab>("today");
	const learning = useLearn(today).data?.find((l) => l.memberId === kid?.id && l.enabled);
	const tabs = TABS.filter((t) => t.id !== "learn" || learning);
	// Learn for a kid without it (switched kids): back to Today.
	const tab = tabs.some((t) => t.id === picked) ? picked : "today";
	const day = fromDayKey(today);
	const thisWeek = useMemo(() => startOfWeek(day), [today]); // eslint-disable-line react-hooks/exhaustive-deps
	const tasks = useTasks().data ?? [];
	const done = useTasksDone(thisWeek).data ?? [];
	const setDone = useSetTaskDone(thisWeek);
	const moments = useMoments(today).data ?? [];
	const buckets = useBuckets().data ?? [];
	const jars = useRewards(today).data ?? [];
	const potty = usePotty().data ?? [];
	// The tile just ticked, for its little pop.
	const [popped, setPopped] = useState<string | null>(null);
	// A grown-up typed their PIN so this kid can put stars in jars (until they switch kids or leave).
	const [jarsFor, setJarsFor] = useState<string | null>(null);
	const [asking, setAsking] = useState<{ body: string; then: () => void } | null>(null);
	// The potty chart starts folded away (it's a tap to open).
	const [pottyOpen, setPottyOpen] = useState(false);
	// Learn's Both switch: the games for two instead of one kid's own (only on Learn).
	const [together, setTogether] = useState(false);
	const bothOn = together && tab === "learn";
	const pottyRef = useRef<HTMLElement>(null);
	// The potty chart header's pencil: a count, bumped each tap.
	const [pottyEdit, setPottyEdit] = useState(0);
	// Opening it scrolls down to it.
	useEffect(() => {
		if (pottyOpen) pottyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, [pottyOpen]);

	if (!kid) {
		return (
				<main className={s.page}>
					<p className={s.none}>No kids yet. A grown-up adds them in Settings.</p>
					<LeaveButton onLeave={onLeave} />
				</main>
			);
		}

		const p = taskProgress(tasks, done, today, [kid.id]).get(kid.id);
		const pct = percent(p);
		const dueToday = tasksFor(tasks, kid.id).filter((t) => dueOn(t, day, kid.id));
		const stickers = moments.filter((m) => m.memberId === kid.id);
		const stars = buckets.find((b) => b.memberId === kid.id)?.stars ?? 0;
		const chart = potty.find((c) => c.memberId === kid.id);

		/** A task's tile: tap to tick it (or untick it). */
		const tile = (t: Task) => {
			const ticked = didTask(done, t, kid.id, today);
			return (
				<button key={t.id} type="button" aria-pressed={ticked} data-todo={ticked ? undefined : ""}
					className={`${s.tile} ${ticked ? s.ticked : ""} ${ticked && popped === t.id ? s.pop : ""}`}
					onClick={() => tick(t)}>
					<span className={s.tileIcon} aria-hidden="true">{t.icon ?? (t.required ? "✅" : "⭐")}</span>
					<span className={s.tileTitle}>{t.title}</span>
					{!t.required && t.points > 0 && (
						<span className={s.tileStars}>+{t.points} <StarIcon className={s.tileStar} /></span>
					)}
					{/* In the corner: a goal says so; a daily task, morning or evening (anytime ones have none). */}
					{!t.required ? <span className={s.tileWhen}>Goal</span>
						: t.time && <span className={s.tileWhen}>{t.time === "morning" ? "AM" : "PM"}</span>}
					{ticked && <span className={s.check} aria-hidden="true">✓</span>}
				</button>
			);
		};

		function tick(t: Task) {
			const ticked = didTask(done, t, kid.id, today);
			if (!ticked) setPopped(t.id);
			setDone.mutate({ taskId: t.id, memberId: kid.id, day: today, done: !ticked });
		}

		// Daily tasks: a punch card, a circle for each of today's required tasks, filled in as they're done.
		const daily = p && (
			<section className={s.daily} aria-label="Daily tasks">
				<h2 className={s.groupHead}>Daily tasks</h2>
				<div className={s.punches} role="img" aria-label={`${p.done} of ${p.due} done`}>
					{Array.from({ length: p.due }, (_, i) => (
						<span key={i} className={`${s.punch} ${i < p.done ? s.punched : ""}`}>
							{i < p.done && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
						</span>
					))}
					{pct === 100 && <span className={s.allDone}>All done! 🎉</span>}
				</div>
				{stickers.length > 0 && (
					<span className={s.caught}>
						Caught being good:{" "}
						<span className={s.stickers} aria-label={`${stickers.length} today`}>
							{stickers.map((m) => momentKind(m.kind).emoji).join("")}
						</span>
					</span>
				)}
			</section>
		);

		return (
			<div className={s.shell} style={{ "--c": kid.color, "--on": textOn(kid.color) } as CSSProperties}>
			<nav className={s.kidNav} aria-label="Kid mode">
				{tabs.map((t) => (
					<button key={t.id} type="button" className={s.kidTab} aria-current={tab === t.id ? "page" : undefined}
						onClick={() => setTab(t.id)}>
						<t.Icon />
						{t.label}
					</button>
				))}
				<LeaveButton onLeave={onLeave} inNav />
			</nav>
			<main className={s.page}>
				{/* The time and date on the left; on the right, the stars they have to put in jars, and whose it
				    is: their name, which opens the other kids (and on Learn, Both) to switch to. */}
				<div className={s.top}>
					<Clock />
					<div className={s.who}>
						{!bothOn && (
							<span className={s.stars} aria-label={`${stars} ${stars === 1 ? "star" : "stars"}`}>
								<StarIcon className={s.star} /> {stars}
							</span>
						)}
						<KidPicker kids={kids} current={bothOn ? BOTH : kid.id} both={tab === "learn" && !!learning}
							onPick={(id) => {
								if (id === BOTH) return setTogether(true);
								setPickedId(id);
								setTogether(false);
							}} />
					</div>
				</div>

				{tab === "today" && <KidToday today={today} kid={kid} />}

				{tab === "tasks" && daily}
				{tab === "tasks" && dueToday.length > 0 && (
					// Pages to swipe between: daily tasks (morning to evening), then goals.
					<TaskPages kidId={kid.id} hold={pottyOpen} pages={[
						{ label: "Daily tasks", tiles: dueToday.filter((t) => t.required).sort(byTime).map(tile) },
						{ label: "Goals", tiles: dueToday.filter((t) => !t.required).map(tile) },
					]} />
				)}
				{tab === "tasks" && dueToday.length === 0 && <p className={s.none}>Nothing to do today. Have fun! 🌈</p>}
				{/* The potty chart, under the tasks: folded away until it's tapped open. */}
				{tab === "tasks" && chart && (
					<section ref={pottyRef} className={s.pottyFold}>
						{/* The header: tap it to open or close; open, a pencil edits the chart (asking for a PIN). */}
						<div className={`${s.pottyHead} ${pottyOpen ? s.pottyHeadOpen : ""}`}>
							<button type="button" className={s.pottyToggle} aria-expanded={pottyOpen} onClick={() => setPottyOpen(!pottyOpen)}>
								<span aria-hidden="true">🚽</span> Potty chart
							</button>
							{pottyOpen && (
								<button type="button" className={s.pottyIcon} aria-label="Edit the potty chart" onClick={() => setPottyEdit((n) => n + 1)}>
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
								</button>
							)}
							<button type="button" className={s.pottyIcon} aria-label={pottyOpen ? "Close the potty chart" : "Open the potty chart"}
								onClick={() => setPottyOpen(!pottyOpen)}>
								<svg className={s.pottyChevron} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
							</button>
						</div>
						{pottyOpen && (
							<PottyCard key={kid.id} kid={kid} chart={chart} canEdit attached editAsked={pottyEdit}
								askFirst={askPin ? (then) => setAsking({ body: "A grown-up types their PIN to change the potty chart.", then }) : undefined} />
						)}
					</section>
				)}

				{tab === "learn" && learning && <LearnTab key={kid.id} kid={kid} today={today} learn={learning} together={bothOn} />}

				{tab === "rewards" && (
					<KidJars
						big
						kid={kid}
						members={members}
						today={today}
						bucket={stars}
						jars={jars.filter((j) => j.status !== "earned" && j.memberIds.includes(kid.id))}
						askFirst={askPin && jarsFor !== kid.id
							? (then) => setAsking({ body: "A grown-up types their PIN to put stars in jars.", then: () => {
								setJarsFor(kid.id);
								then();
							} })
							: undefined}
					/>
				)}
				{asking && (
					<GrownUpPin
						title="Ask a grown-up"
						body={asking.body}
						okLabel="OK"
						onClose={() => setAsking(null)}
						onOk={() => {
							asking.then();
							setAsking(null);
						}}
					/>
				)}
			</main>
		</div>
	);
}

const BLOCK_GAP = 12;
/** How much of the next page peeks in (px). */
const PEEK = 36;

/**
 * Today's tasks as pages to swipe between, a page at a time, each page of
 * blocks sized so they all fit (no scrolling up and down), goals straight after the daily tasks. Upright,
 * six to a page; on its side, four across and as many rows as fit. The next page peeks in at the side, and dots underneath show which page it's on.
 * It opens at the page with the first one not done yet.
 */
function TaskPages({ kidId, pages, hold }: {
	kidId: string;
	pages: { label: string; tiles: ReactNode[] }[];
	/** Keep the size they are (the potty chart's opened under them: the screen scrolls to it instead). */
	hold: boolean;
}) {
	const row = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState({ w: 0, h: 0 });
	const holding = useRef(hold);
	holding.current = hold;
	// The screen's way up (not the pages' own box, which the potty chart under it can make wide).
	const upright = useMediaQuery("(orientation: portrait)");
	const [at, setAt] = useState(0);
	useLayoutEffect(() => {
		const el = row.current;
		if (!el) return;
		const measure = () => setBox((b) => (holding.current ? { ...b, w: el.clientWidth } : { w: el.clientWidth, h: el.clientHeight }));
		measure();
		const watch = new ResizeObserver(measure);
		watch.observe(el);
		return () => watch.disconnect();
	}, []);
	// Opening (or switching kids): the page with the first one not done yet.
	const laidOut = box.w > 0;
	useEffect(() => {
		const el = row.current;
		if (!el || !laidOut) return;
		const pageOf = el.querySelector("[data-todo]")?.closest("section") as HTMLElement | null;
		el.scrollTo({ left: pageOf?.offsetLeft ?? 0 });
		// Not as each one's ticked, or when the screen turns.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [kidId, laidOut]);

	// Lay each out: as one page if its blocks are big enough, or split over as many pages as it takes.
	const filled = pages.filter((p) => p.tiles.length > 0);
	const lay = (peek: boolean) => {
		const w = box.w - (peek ? PEEK : 0);
		// Room under the blocks for their raised edge.
		const h = box.h - 6;
		// Upright, six to a page (two across, three down). On its side, four across and as many rows as fit
		// (one on a phone, two or three on a tablet). The next page peeks in.
		const pagesOf = (label: string, tiles: ReactNode[]) => {
			const cols = upright ? 2 : 4;
			const across = (w - BLOCK_GAP * (cols - 1)) / cols;
			const rows = upright ? 3 : Math.max(1, Math.floor((h + BLOCK_GAP) / (Math.min(across, 260) + BLOCK_GAP)));
			const size = Math.floor(Math.min(across, (h - BLOCK_GAP * (rows - 1)) / rows, 280));
			const per = cols * rows;
			return Array.from({ length: Math.ceil(tiles.length / per) }, (_, i) => ({
				label: `${label} ${i + 1}`, tiles: tiles.slice(i * per, (i + 1) * per), cols, size,
			}));
		};
		// One run: daily tasks, then goals straight after.
		return pagesOf("Tasks", filled.flatMap((p) => p.tiles));
	};
	const once = lay(false);
	const shown = once.length > 1 ? lay(true) : once;
	return (
		<div className={s.pages} style={hold && box.h ? { flex: "none" } : undefined}>
			<div ref={row} className={s.pageRow} style={hold && box.h ? { flex: "none", height: box.h } : undefined}
				onScroll={(e) => {
					const el = e.currentTarget;
					const width = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth;
					setAt(Math.min(shown.length - 1, Math.round(el.scrollLeft / (width + BLOCK_GAP))));
				}}>
				{box.w > 0 && shown.map((p) => (
					<section key={p.label} className={s.taskPage} aria-label={p.label}
						// As wide as its blocks, so the next page's follow on (and peek in) right after.
						style={{ flexBasis: p.cols * p.size + (p.cols - 1) * BLOCK_GAP }}>
						<div className={s.blocks} style={{ gridTemplateColumns: `repeat(${p.cols}, ${p.size}px)`, "--size": `${p.size}px` } as CSSProperties}>
							{p.tiles}
						</div>
					</section>
				))}
			</div>
			{shown.length > 1 && (
				<div className={s.pageDots} aria-hidden="true">
					{shown.map((p, i) => <span key={p.label} className={at === i ? s.pageDotOn : ""} />)}
				</div>
			)}
		</div>
	);
}

/** The way out: it asks for a grown-up's PIN. Last in the nav, or (with no kids, so no nav) a small button. */
function LeaveButton({ onLeave, inNav }: { onLeave: () => void; inNav?: boolean }) {
	return (
		<button type="button" className={inNav ? `${s.kidTab} ${s.leaveTab}` : s.leave} aria-label="Grown-ups: leave kid mode"
			title="Grown-ups: leave kid mode" onClick={onLeave}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{/* A door: its frame, the door standing ajar, and the knob. */}
				<path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
				<path d="M6 3.2l7 2.3v15.5" />
				<circle cx="11" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
			</svg>
			{inNav && "Exit"}
		</button>
	);
}

/** A guardian's PIN, checked (nothing else changes): to leave kid mode, or let a kid put stars in jars. */
export function GrownUpPin({ title, body, okLabel, onClose, onOk }: {
	title: string;
	body: string;
	okLabel: string;
	onClose: () => void;
	onOk: () => void;
}) {
	const [pin, setPin] = useState("");
	const check = useMutation({ mutationFn: api.checkPin, meta: { inline: true } });

	function submit(e?: FormEvent, typed = pin) {
		e?.preventDefault();
		if (!typed || check.isPending) return;
		// Awaited rather than mutate's callbacks, which are dropped if the dialog re-renders from new while
		// the PIN is checked (it stayed open, with the button off, on phones).
		check.mutateAsync(typed).then(onOk, () => setPin(""));
	}

	return (
		<>
			<Sheet label={title} onClose={onClose} className={`${sheet.confirm} ${pinSheet}`} onSubmit={submit}>
				<h2 className={sheet.heading}>{title}</h2>
				<div className={sheet.body}>{body}</div>
				<PinPad value={pin} onChange={setPin} onEnter={(typed) => submit(undefined, typed)} error={check.error?.message} done={okLabel} />
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
					<button type="submit" className={sheet.primary} disabled={!pin || check.isPending}>{okLabel}</button>
				</div>
			</Sheet>
		</>
	);
}

/** Starting kid mode on this device: which kid it opens on (the name at the top switches to the others). */
export function KidModeStart({ kids, needsPin, onPick, onClose }: {
	kids: Member[];
	/** No guardian has a PIN yet, so no one could get back out. */
	needsPin: boolean;
	onPick: (id: string) => void;
	onClose: () => void;
}) {

	return (
		<>
			<Sheet label="Kid mode" onClose={onClose} className={sheet.confirm}>
				<h2 className={sheet.heading}>Kid mode</h2>
				{needsPin ? (
					<div className={sheet.body}>
						Set a guardian PIN first (Settings, then Household access), so only a grown-up can leave kid mode.
					</div>
				) : kids.length === 0 ? (
					<div className={sheet.body}>Add a kid with a birthday in Settings first.</div>
				) : (
					<>
						<div className={sheet.body}>
							Who's it for? Just their day, tasks, stars and jars, in big pictures; tap their name at the top to switch kids. To leave, tap the exit button in the corner and type a guardian's PIN.
						</div>
						<div className={s.startPicks}>
							{kids.map((k) => (
								<button key={k.id} type="button" className={s.startPick}
									style={{ "--c": k.color, "--on": textOn(k.color) } as CSSProperties} onClick={() => onPick(k.id)}>
									<span className={s.faceDot} aria-hidden="true">{k.name.slice(0, 1)}</span>
									{k.name}
								</button>
							))}
						</div>
					</>
				)}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
				</div>
			</Sheet>
		</>
	);
}

/** Learn's Both: the games for two, in a colour of its own. */
const BOTH = "both";
const BOTH_COLOR = "#7a5cc8";

/**
 * Whose it is, top right: their name (Both: both names) in their colour. Tapped, a list drops down of the
 * other kids (and on Learn, Both) to switch to. With nobody else to switch to, just the name.
 */
function KidPicker({ kids, current, both, onPick }: {
	kids: Member[];
	/** A kid's id, or BOTH. */
	current: string;
	/** Both's an option (on Learn). */
	both: boolean;
	onPick: (id: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	// A tap anywhere else, or Escape, closes it.
	useEffect(() => {
		if (!open) return;
		const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
		const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		document.addEventListener("pointerdown", away);
		document.addEventListener("keydown", key);
		return () => {
			document.removeEventListener("pointerdown", away);
			document.removeEventListener("keydown", key);
		};
	}, [open]);
	const first = (k: Member) => firstName(k.name);
	const shown = current === BOTH ? { name: kids.map(first).join(" & "), color: BOTH_COLOR } : kids.find((k) => k.id === current) ?? kids[0];
	const others = [
		...kids.filter((k) => k.id !== current).map((k) => ({ id: k.id, name: k.name, color: k.color })),
		...(both && current !== BOTH ? [{ id: BOTH, name: "Both", color: BOTH_COLOR }] : []),
	];
	const colours = (c: string) => ({ "--c": c, "--on": textOn(c) }) as CSSProperties;
	if (others.length === 0) return <h1 className={s.kidName} style={colours(shown.color)}>{shown.name}</h1>;
	return (
		<div ref={box} className={s.picker}>
			<h1 className={s.pickerHead}>
				<button type="button" className={s.kidName} style={colours(shown.color)} aria-haspopup="menu" aria-expanded={open}
					onClick={() => setOpen((o) => !o)}>
					{shown.name}
					<svg viewBox="0 0 24 24" aria-hidden="true" className={open ? s.kidNameOpen : ""}>
						<path d="M6 9l6 6 6-6" />
					</svg>
				</button>
			</h1>
			{open && (
				<div role="menu" className={s.kidMenu} aria-label="Switch to">
					{others.map((o) => (
						<button key={o.id} type="button" role="menuitem" className={s.kidMenuItem} style={colours(o.color)}
							onClick={() => {
								setOpen(false);
								onPick(o.id);
							}}>
							<span className={s.kidMenuDot} aria-hidden="true" />
							{o.name}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

/** The time and the date, kept up to the minute, for the header on every tab. */
function Clock() {
	const now = useNow();
	return (
		<p className={s.clock}>
			<span className={s.clockTime}>{timeLabel(now)}</span>
			<span className={s.clockDate}>{longDate(now)}</span>
		</p>
	);
}
