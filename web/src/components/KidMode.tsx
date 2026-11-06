import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { fromDayKey, startOfWeek, timeLabel } from "../lib/dates";
import { api } from "../lib/api";
import {
	useBuckets,
	useMoments,
	usePotty,
	useRangeEvents,
	useRewards,
	useSetTaskDone,
	useTasks,
	useTasksDone,
} from "../lib/queries";
import { momentKind } from "../lib/moments";
import { didTask, dueOn, percent, taskProgress, tasksFor, TIMES } from "../lib/tasks";
import type { Member, Task } from "../lib/types";
import { textOn } from "../lib/color";
import KidJars from "./KidJars";
import PottyCard from "./PottyCard";
import { StarIcon } from "./icons";
import sheet from "../styles/Sheet.module.css";
import r from "../styles/Rewards.module.css";
import s from "../styles/KidMode.module.css";

/** Holding the corner button this long asks for a grown-up. */
const HOLD_MS = 2000;

interface Props {
	today: string;
	/** The kids this screen is for: one, or several to switch between (a shared tablet). */
	kids: Member[];
	members: Member[];
	/** The corner button was held: a grown-up wants out. */
	onLeave: () => void;
	/** Putting stars in jars needs a guardian's PIN first (false: there's no PIN to ask for). */
	askPin: boolean;
}

/** Required tasks by part of the day, then goals: as on the Tasks page. */
const GROUPS: { label: string; has: (t: Task) => boolean }[] = [
	...TIMES.map((t) => ({ label: t.label, has: (c: Task) => c.required && c.time === t.id })),
	{ label: "Goals", has: (c: Task) => !c.required },
];

/**
 * Kid mode: one kid's day as big pictures (ages 2–6 first). Their tasks to tap, their goals, today's
 * stickers, stars and jars, and what's next for them. No calendar, settings or anyone else's things.
 * Tapping a done task again unticks it, so nothing can go wrong. A grown-up holds the corner button
 * to leave.
 */
export default function KidMode({ today, kids, members, onLeave, askPin }: Props) {
	const [pickedId, setPickedId] = useState(kids[0]?.id ?? null);
	const kid = kids.find((k) => k.id === pickedId) ?? kids[0];
	const day = fromDayKey(today);
	const thisWeek = useMemo(() => startOfWeek(day), [today]); // eslint-disable-line react-hooks/exhaustive-deps
	const tasks = useTasks().data ?? [];
	const done = useTasksDone(thisWeek).data ?? [];
	const setDone = useSetTaskDone(thisWeek);
	const moments = useMoments(today).data ?? [];
	const buckets = useBuckets().data ?? [];
	const jars = useRewards(today).data ?? [];
	const events = useRangeEvents(day, 1).data ?? [];
	const potty = usePotty().data ?? [];
	// The tile just ticked, for its little pop.
	const [popped, setPopped] = useState<string | null>(null);
	// A grown-up typed their PIN so this kid can put stars in jars (until they switch kids or leave).
	const [jarsFor, setJarsFor] = useState<string | null>(null);
	const [asking, setAsking] = useState<{ body: string; then: () => void } | null>(null);

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
	const now = Date.now();
	const next = events
		.filter((e) => !e.allDay && e.memberIds.includes(kid.id) && Date.parse(e.end) > now)
		.sort((a, b) => a.start.localeCompare(b.start))[0];

	function tick(t: Task) {
		const ticked = didTask(done, t, kid.id, today);
		if (!ticked) setPopped(t.id);
		setDone.mutate({ taskId: t.id, memberId: kid.id, day: today, done: !ticked });
	}

	return (
		<main className={s.page} style={{ "--c": kid.color, "--on": textOn(kid.color), "--p": `${pct}%` } as CSSProperties}>
			<div className={s.top}>
				{/* Each kid's name is a switch: the one showing is on (with one kid, it's always on). */}
				<div className={s.faces} role="radiogroup" aria-label="Who's playing">
					{kids.map((k) => (
						<button key={k.id} type="button" role="radio" className={s.face} aria-checked={k.id === kid.id}
							style={{ "--c": k.color, "--on": textOn(k.color) } as CSSProperties}
							onClick={() => setPickedId(k.id)}>
							{k.name}
							<span className={s.knob} aria-hidden="true" />
						</button>
					))}
				</div>
				<LeaveButton onLeave={onLeave} />
			</div>

			<h1 className={s.name}>{kid.name}</h1>

			{potty.some((c) => c.memberId === kid.id) && (
				<PottyCard key={kid.id} kid={kid} chart={potty.find((c) => c.memberId === kid.id)!} canEdit
					askFirst={askPin ? (then) => setAsking({ body: "A grown-up types their PIN to change the potty chart.", then }) : undefined} />
			)}

			{next && (
				<div className={s.next}>
					<span className={s.nextLabel}>Next</span>
					<span className={s.nextTitle}>{next.title}</span>
					<span className={s.nextTime}>{timeLabel(next.start)}</span>
				</div>
			)}

			{GROUPS.map((g) => {
				const group = dueToday.filter(g.has);
				if (group.length === 0) return null;
				return (
					<section key={g.label} className={s.group} aria-label={g.label}>
						<h2 className={s.groupHead}>{g.label}</h2>
						<div className={s.tiles}>
							{group.map((t) => {
								const ticked = didTask(done, t, kid.id, today);
								return (
									<button key={t.id} type="button" aria-pressed={ticked}
										className={`${s.tile} ${ticked ? s.ticked : ""} ${ticked && popped === t.id ? s.pop : ""}`}
										onClick={() => tick(t)}>
										<span className={s.tileIcon} aria-hidden="true">{t.icon ?? (t.required ? "✅" : "⭐")}</span>
										<span className={s.tileTitle}>{t.title}</span>
										{!t.required && t.points > 0 && (
											<span className={s.tileStars}>+{t.points} <StarIcon className={s.tileStar} /></span>
										)}
										{ticked && <span className={s.check} aria-hidden="true">✓</span>}
									</button>
								);
							})}
						</div>
					</section>
				);
			})}
			{dueToday.length === 0 && <p className={s.none}>Nothing to do today. Have fun! 🌈</p>}

			<section className={s.group} aria-label="Stars earned">
				<h2 className={s.groupHead}>Stars earned</h2>
				<div className={s.hero}>
					<div className={s.heroRow}>
						<span className={s.bar} aria-hidden="true"><span /></span>
						<span className={s.stars} aria-label={`${stars} ${stars === 1 ? "star" : "stars"}`}>
							<StarIcon className={s.star} /> {stars}
						</span>
					</div>
					<div className={s.status}>
						{!p ? "" : pct === 100 ? "All done! 🎉" : `${p.done} of ${p.due} done`}
						{stickers.length > 0 && (
							<span className={s.stickers} aria-label={`${stickers.length} caught being good`}>
								{stickers.map((m) => momentKind(m.kind).emoji).join("")}
							</span>
						)}
					</div>
				</div>
			</section>

			<div>
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
			</div>
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
	);
}

/** A small exit button in the corner: hold it for two seconds (a ring fills) to ask for a grown-up. */
function LeaveButton({ onLeave }: { onLeave: () => void }) {
	const [holding, setHolding] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const stop = () => {
		clearTimeout(timer.current);
		setHolding(false);
	};
	const start = () => {
		setHolding(true);
		timer.current = setTimeout(() => {
			setHolding(false);
			onLeave();
		}, HOLD_MS);
	};
	useEffect(() => () => clearTimeout(timer.current), []);
	return (
		<button type="button" className={`${s.leave} ${holding ? s.holding : ""}`}
			aria-label="Grown-ups: hold to leave kid mode" title="Grown-ups: hold to leave"
			onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
			onContextMenu={(e) => e.preventDefault()}
			onKeyDown={(e) => e.key === "Enter" && !e.repeat && start()} onKeyUp={stop}
			style={{ "--hold": `${HOLD_MS}ms` } as CSSProperties}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{/* A door: its frame, the door standing ajar, and the knob. */}
				<path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
				<path d="M6 3.2l7 2.3v15.5" />
				<circle cx="11" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
			</svg>
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

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	function submit(e: FormEvent) {
		e.preventDefault();
		check.mutate(pin, { onSuccess: onOk, onError: () => setPin("") });
	}

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<form className={`${sheet.sheet} ${sheet.confirm}`} role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
				<h2 className={sheet.heading}>{title}</h2>
				<div className={sheet.body}>{body}</div>
				<input className={r.pin} type="password" inputMode="numeric" autoComplete="off" placeholder="Guardian PIN"
					aria-label="Guardian PIN" maxLength={12} value={pin} autoFocus onChange={(e) => setPin(e.target.value)} />
				{check.isError && <div className={r.problem}>{check.error.message}</div>}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
					<button type="submit" className={sheet.primary} disabled={!pin || check.isPending}>{okLabel}</button>
				</div>
			</form>
		</>
	);
}

/** Starting kid mode on this device: which kid (or all of them, to switch between). */
export function KidModeStart({ kids, needsPin, onPick, onClose }: {
	kids: Member[];
	/** No guardian has a PIN yet, so no one could get back out. */
	needsPin: boolean;
	onPick: (id: string) => void;
	onClose: () => void;
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<div className={`${sheet.sheet} ${sheet.confirm}`} role="dialog" aria-modal="true" aria-label="Kid mode">
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
							Just their tasks, stars and jars, in big pictures. To leave, hold the exit button in the corner and type a guardian's PIN.
						</div>
						<div className={s.startPicks}>
							{kids.map((k) => (
								<button key={k.id} type="button" className={s.startPick}
									style={{ "--c": k.color, "--on": textOn(k.color) } as CSSProperties} onClick={() => onPick(k.id)}>
									<span className={s.faceDot} aria-hidden="true">{k.name.slice(0, 1)}</span>
									{k.name}
								</button>
							))}
							{kids.length > 1 && (
								<button type="button" className={s.startPick} onClick={() => onPick("all")}>
									<span className={s.faceDot} aria-hidden="true">👫</span>
									All kids
								</button>
							)}
						</div>
					</>
				)}
				<div className={sheet.actions}>
					<span className={sheet.spacer} />
					<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
				</div>
			</div>
		</>
	);
}
