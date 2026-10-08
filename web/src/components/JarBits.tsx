import type { CSSProperties } from "react";
import { fromDayKey } from "../lib/dates";
import { textOn } from "../lib/color";
import type { Member, Reward } from "../lib/types";
import { StarIcon } from "./icons";
import s from "../styles/Rewards.module.css";

/** A day key as a date, or an ISO instant (e.g. when it was redeemed) in local time. */
export const toDate = (d: string) => (d.length > 10 ? new Date(d) : fromDayKey(d));

/** "Oct 9". */
export const shortDay = (d: string) => toDate(d).toLocaleDateString([], { month: "short", day: "numeric" });

/** "Oct 9 at 7:45 PM", from an ISO instant. */
export const dayAndTime = (iso: string) =>
	`${shortDay(iso)} at ${new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

/** The kids' names, each in their color; "together" when there's more than one. */
export function Who({ ids, members }: { ids: string[]; members: Member[] }) {
	const who = members.filter((m) => ids.includes(m.id));
	return (
		<span className={s.who}>
			{who.map((m) => (
				<span key={m.id} className={s.name} style={{ background: m.color, color: textOn(m.color) } as CSSProperties}>
					{m.name}
				</span>
			))}
			{who.length > 1 && <span className={s.together}>together</span>}
		</span>
	);
}

/** Each fills it: every kid needs the full amount on their own. */
export const eachFills = (r: Reward) => r.teamMode === "each" && r.memberIds.length > 1;

/**
 * Stars in a jar: one bar split by who put what in, or (each fills it) one bar per kid.
 * `adding` shows stars a kid has placed but not yet confirmed, striped.
 */
export function JarProgress({ r, members, adding }: { r: Reward; members: Member[]; adding?: { kid: Member; n: number } }) {
	const who = members.filter((m) => r.memberIds.includes(m.id));
	const width = (n: number) => `${Math.min(100, (n / r.goal) * 100)}%`;
	const extra = (m: Member) => (adding?.kid.id === m.id ? adding.n : 0);
	const staged = (m: Member) =>
		extra(m) > 0 && <span className={s.adding} style={{ width: width(extra(m)), "--c": m.color } as CSSProperties} />;
	if (eachFills(r)) {
		return (
			<div className={s.eachBars}>
				{who.map((m) => {
					const n = r.memberStars[m.id] ?? 0;
					return (
						<div key={m.id} className={s.eachRow}>
							<span className={s.eachName}>{m.name}</span>
							<span className={s.bar}>
								<span style={{ width: width(n), background: m.color }} />
								{staged(m)}
							</span>
							<span className={s.count}>
								{n + extra(m)}/{r.goal}
							</span>
						</div>
					);
				})}
			</div>
		);
	}
	return (
		<div className={s.eachRow}>
			<span className={s.bar}>
				{who.map((m) => (
					<span
						key={m.id}
						title={`${m.name}: ${r.memberStars[m.id] ?? 0} ⭐`}
						style={{ width: width(r.memberStars[m.id] ?? 0), background: m.color }}
					/>
				))}
				{adding && staged(adding.kid)}
			</span>
			<span className={s.count}>
				<StarIcon className={s.star} />
				{r.stars + (adding?.n ?? 0)}/{r.goal}
			</span>
		</div>
	);
}
