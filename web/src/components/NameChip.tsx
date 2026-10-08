import type { CSSProperties } from "react";
import { textOn } from "../lib/color";
import s from "../styles/NameChip.module.css";

/**
 * A person to pick (who an event, task or reward is for): outlined in their color, filled when picked.
 * With no onClick it's just a label (who something is for).
 */
export function PickChip({ name, color, on, onClick }: { name: string; color: string; on: boolean; onClick?: () => void }) {
	const style = { "--c": color, color: on ? textOn(color) : undefined } as CSSProperties;
	if (!onClick) {
		return (
			<span className={`${s.pick} ${on ? s.pickOn : ""} ${s.label}`} style={style}>
				{name}
			</span>
		);
	}
	return (
		<button type="button" className={`${s.pick} ${on ? s.pickOn : ""}`} aria-pressed={on} style={style} onClick={onClick}>
			{name}
		</button>
	);
}

/**
 * A person to filter by, with their color dot. On the calendar it also fills with their color as they
 * get through today's tasks (pct), and turns solid with a ✓ when they're all done.
 */
export function FilterChip({ name, color, on, dimmed, pct = 0, title, onClick }: {
	name: string;
	color: string;
	on: boolean;
	/** Another filter is picked. */
	dimmed?: boolean;
	pct?: number;
	title?: string;
	onClick: () => void;
}) {
	return (
		<button
			className={`${s.filter} ${pct === 100 ? s.complete : ""} ${on ? s.filterOn : ""} ${dimmed ? s.dimmed : ""}`}
			style={{ "--c": color, "--p": `${pct}%` } as CSSProperties}
			aria-pressed={on}
			title={title}
			onClick={onClick}
		>
			<i style={{ background: color }} />
			{name}
			{pct === 100 && " ✓"}
		</button>
	);
}
