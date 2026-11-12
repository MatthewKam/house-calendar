import { useNow } from "../lib/useNow";
import { useAuthStatus, useLists, useMembers, useOutbox, useReminders, useRewardHistory } from "../lib/queries";
import ColorAsked from "./ColorAsked";
import { dueLabel, isDue, isLate } from "../lib/lists";
import type { Page } from "./NavBar";
import s from "../styles/Today.module.css";

/**
 * Today's "Needs you": only what's waiting (calendar clashes, rewards to hand over, reminders due,
 * lists with things left, and for the account holder, new colors to OK), each going to its page or
 * answered here. Not shown when nothing is.
 */
export default function NeedsYou({ me, onPage }: {
	/** The person this device is signed in as; null on the wall (reminders for anyone). */
	me: string | null;
	onPage: (page: Page) => void;
}) {
	const now = useNow();
	const outbox = useOutbox().data;
	const toHandOver = (useRewardHistory().data ?? []).filter(
		(w) => !w.givenAt && !w.missedOn,
	);
	const own = useLists().data ?? [];
	// Reminders due now (or late) on Sprig's lists, for me or for anyone.
	const due = own.flatMap((l) =>
		l.items.filter(
			(i) =>
				!i.done &&
				i.due &&
				isDue(i.due, now) &&
				(!me || !i.memberId || i.memberId === me),
		),
	);
	const lists = [...own, ...(useReminders().data?.lists ?? [])]
		.map((l) => ({
			title: l.title,
			open: l.items.filter((i) => !i.done).length,
		}))
		.filter((l) => l.open > 0);
	const clashes = outbox?.conflicts.length ?? 0;
	// New colors for the account holder to OK (signed in: there's no holder otherwise).
	const auth = useAuthStatus().data;
	const members = useMembers().data ?? [];
	const colors = auth?.signedIn && auth.holder ? members.filter((m) => m.colorAsked) : [];
	const needs = clashes + toHandOver.length + due.length + lists.length + colors.length;
	if (needs === 0) return null;
	return (
		<section className={s.card}>
			<h2 className={s.cardHead}>Needs you</h2>
			<ul className={s.needs}>
				{clashes > 0 && (
					<li>
						<button
							type="button"
							className={s.need}
							onClick={() => onPage("calendar")}
						>
							<span aria-hidden="true">⚠️</span>
							{clashes === 1
								? "A calendar change clashes with one made elsewhere"
								: `${clashes} calendar changes clash with ones made elsewhere`}
						</button>
					</li>
				)}
				{toHandOver.map((w) => (
					<li key={w.id}>
						<button
							type="button"
							className={s.need}
							onClick={() => onPage("rewards")}
						>
							<span aria-hidden="true">🎁</span>
							{w.title} is earned: hand it over
						</button>
					</li>
				))}
				{due.map((i) => (
					<li key={i.id}>
						<button
							type="button"
							className={s.need}
							onClick={() => onPage("lists")}
						>
							<span aria-hidden="true">⏰</span>
							<span className={s.needText}>
								{i.title}
								<span
									className={isLate(i.due!, now) ? s.late : s.dueWhen}
								>
									{dueLabel(i.due!, now)}
								</span>
							</span>
						</button>
					</li>
				))}
				{colors.map((m) => (
					<li key={m.id}>
						<ColorAsked member={m} />
					</li>
				))}
				{lists.map((l) => (
					<li key={l.title}>
						<button
							type="button"
							className={s.need}
							onClick={() => onPage("lists")}
						>
							<span aria-hidden="true">📝</span>
							{l.title}: {l.open} {l.open === 1 ? "item" : "items"}
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
