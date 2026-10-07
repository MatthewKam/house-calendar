import { useState } from "react";
import { ALL_EMOJI, searchEmoji } from "../lib/emoji";
import s from "../styles/IconPicker.module.css";

interface Props {
	value: string | null;
	onChange: (icon: string | null) => void;
	/** Shown before Show more. */
	featured: string[];
	autoFocus?: boolean;
}

/**
 * Pick an emoji: a short set to start, Show more for everything, or type to search ("milk", "soccer").
 * None clears it.
 */
export default function IconPicker({ value, onChange, featured, autoFocus }: Props) {
	const [query, setQuery] = useState("");
	const [more, setMore] = useState(false);
	const found = query.trim() ? searchEmoji(query).map((x) => x.e) : null;
	// The current pick stays visible even when it's not in the short set.
	const base = more ? ALL_EMOJI.map((x) => x.e) : value && !featured.includes(value) ? [value, ...featured] : featured;
	const shown = found ?? base;
	const choice = (icon: string | null, label?: string) => (
		<button
			key={icon ?? "none"}
			type="button"
			role="radio"
			aria-checked={value === icon}
			className={`${s.choice} ${value === icon ? s.on : ""}`}
			onClick={() => onChange(icon)}
			title={label}
		>
			{icon ?? <span className={s.none}>None</span>}
		</button>
	);
	return (
		<div className={s.picker}>
			<input
				className={s.search}
				type="search"
				placeholder="Search icons, e.g. milk or soccer"
				value={query}
				autoFocus={autoFocus}
				onChange={(e) => setQuery(e.target.value)}
				aria-label="Search icons"
			/>
			<div className={s.grid} role="radiogroup" aria-label="Icon">
				{choice(null, "No icon")}
				{shown.map((e) => choice(e, ALL_EMOJI.find((x) => x.e === e)?.k.split(" ")[0]))}
			</div>
			{found && found.length === 0 && <div className={s.empty}>No icons match “{query.trim()}”.</div>}
			{!found && (
				<button type="button" className={s.more} onClick={() => setMore(!more)}>
					{more ? "Show fewer" : `Show more (${ALL_EMOJI.length})`}
				</button>
			)}
		</div>
	);
}
