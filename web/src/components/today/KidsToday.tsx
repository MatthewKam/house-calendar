import { useMemo, useState, type CSSProperties } from "react";
import { fromDayKey, startOfWeek } from "../../lib/dates";
import { useBuckets, useMoments, useTasks, useTasksDone } from "../../lib/queries";
import { momentKind } from "../../lib/moments";
import { isKid } from "../../lib/people";
import { percent, taskProgress, tasksFor } from "../../lib/tasks";
import type { Member } from "../../lib/types";
import type { Page } from "../nav/NavBar";
import MomentDialog from "../tasks/MomentDialog";
import { StarIcon } from "../ui/icons";
import s from "./Today.module.css";

/**
 * Today's "The kids today": each kid's tasks done (a bar in their colour), stickers and stars, and
 * (for a parent) Caught being good. Not shown with no kids.
 */
export default function KidsToday({ today, members, parent, onPage }: {
	today: string;
	members: Member[];
	/** Parent changes are allowed right now (Caught being good). */
	parent: boolean;
	onPage: (page: Page) => void;
}) {
	const day = fromDayKey(today);
	// The kids: today's tasks, stickers and stars.
	const kids = members.filter(isKid);
	const tasks = useTasks().data ?? [];
	const thisWeek = useMemo(() => startOfWeek(day), [today]); // eslint-disable-line react-hooks/exhaustive-deps
	const done = useTasksDone(thisWeek).data ?? [];
	const progress = taskProgress(
		tasks,
		done,
		today,
		kids.map((k) => k.id),
	);
	const moments = useMoments(today).data ?? [];
	const buckets = useBuckets().data ?? [];
	const [catching, setCatching] = useState(false);
	if (kids.length === 0) return null;
	return (
		<>
			<section className={s.card}>
				<div className={s.cardTop}>
					<h2 className={s.cardHead}>The kids today</h2>
					{parent && (
						<button
							type="button"
							className={s.catch}
							onClick={() => setCatching(true)}
						>
							✨ Caught being good
						</button>
					)}
				</div>
				<ul className={s.kids}>
					{kids.map((k) => {
						const p = progress.get(k.id);
						const pct = percent(p);
						const stickers = moments.filter((mo) => mo.memberId === k.id);
						const stars =
							buckets.find((b) => b.memberId === k.id)?.stars ?? 0;
						const hasTasks = tasksFor(tasks, k.id).length > 0;
						return (
							<li key={k.id}>
								<button
									type="button"
									className={s.kid}
									onClick={() => onPage("tasks")}
									style={
										{ "--c": k.color, "--p": `${pct}%` } as CSSProperties
									}
								>
									<span className={s.kidName}>{k.name}</span>
									<span className={s.kidBar} aria-hidden="true">
										<span />
									</span>
									<span className={s.kidMeta}>
										{!hasTasks || !p
											? "No tasks today"
											: pct === 100
												? "All done! 🎉"
												: `${p.done} of ${p.due} tasks`}
										{stickers.length > 0 && (
											<span
												className={s.stickers}
												aria-label={`${stickers.length} caught being good`}
											>
												{stickers
													.map((mo) => momentKind(mo.kind).emoji)
													.join("")}
											</span>
										)}
										<span className={s.stars}>
											<StarIcon className={s.star} /> {stars}
										</span>
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</section>
			{catching && <MomentDialog kids={kids} today={today} onClose={() => setCatching(false)} />}
		</>
	);
}
