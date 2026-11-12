import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import s from "../styles/QuickAdd.module.css";

type QuickKind = "event" | "list" | "good" | "task" | "photo" | "snap" | "say";
/** The ones that open the phone's picker (Snap: the camera) and get what was picked. */
type Picking = "photo" | "snap";

/** One thing the + adds. */
export type QuickAction =
	| { kind: Exclude<QuickKind, Picking>; onPick: () => void }
	| { kind: Picking; files: (files: File[]) => void };

const line = (d: string) => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d={d} />
	</svg>
);

/** Each kind's words, icon, and the circle behind the icon (its color, and the icon's). */
const LOOK: Record<QuickKind, { label: string; icon: ReactNode; tint: string; ink: string }> = {
	event: {
		label: "New event",
		icon: line("M6 5h12a2.5 2.5 0 0 1 2.5 2.5v10.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5V7.5A2.5 2.5 0 0 1 6 5zM3.5 10h17M8 3v4M16 3v4"),
		tint: "#eef0f3", ink: "#3c4450",
	},
	list: {
		label: "Add to a list",
		icon: line("M9 6.5h11M9 12h11M9 17.5h11M4.75 5.25a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 1 1 0-2.5zM4.75 10.75a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 1 1 0-2.5zM4.75 16.25a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 1 1 0-2.5z"),
		tint: "#f1ecfb", ink: "#5b3c99",
	},
	good: {
		label: "Caught being good",
		icon: line("M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z"),
		tint: "#fff6dc", ink: "#8a5a00",
	},
	task: {
		label: "Add a task",
		icon: line("M6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3zM8 8.5l1.5 1.5L12 7.5M8 14.5l1.5 1.5 2.5-2.5M14.5 9h2M14.5 15h2"),
		tint: "color-mix(in srgb, var(--accent) 10%, #fff)", ink: "var(--accent)",
	},
	photo: {
		label: "Add a photo",
		icon: line("M6 5h12a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9A2.5 2.5 0 0 1 6 5zM9 8.4a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 1 1 0-3.2zM4 17l5-4.5 3.5 3 3-2.5 4.5 4"),
		tint: "#e8f1fd", ink: "#1d4f91",
	},
	snap: {
		label: "Snap a flyer",
		icon: line("M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 10a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z"),
		tint: "#fff1e6", ink: "#9a4a00",
	},
	say: {
		label: "Say it",
		icon: line("M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"),
		tint: "var(--accent)", ink: "var(--on-accent)",
	},
};

/**
 * Phones: the round + in the middle of the bottom bar. Tapped, it turns into an ✕ and the actions rise
 * above it as a stack, the first at the top.
 */
export default function QuickAdd({ actions }: { actions: QuickAction[] }) {
	const [open, setOpen] = useState(false);
	const pickers = { photo: useRef<HTMLInputElement>(null), snap: useRef<HTMLInputElement>(null) };

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	function pick(a: QuickAction) {
		setOpen(false);
		// The picker opens from the tap itself, as phones require.
		if ("files" in a) pickers[a.kind].current?.click();
		else a.onPick();
	}

	return (
		<>
			<button className={`${s.plus} ${open ? s.open : ""}`} onClick={() => setOpen(!open)}
				aria-label={open ? "Close" : "Add"} aria-expanded={open}>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 5v14M5 12h14" />
				</svg>
			</button>
			{actions.map((a) => "files" in a && (
				// Snap: one picture, taken now or from the phone's photos (the phone asks which); Add a photo:
				// any number from the library.
				<input key={a.kind} ref={pickers[a.kind]} type="file" hidden
					{...(a.kind === "snap" ? { accept: "image/*" } : { accept: "image/*,video/*", multiple: true })}
					onChange={(e) => {
						const files = [...(e.target.files ?? [])];
						e.target.value = "";
						if (files.length) a.files(files);
					}} />
			))}
			{open && (
				<>
					<div className={s.scrim} onClick={() => setOpen(false)} role="presentation" />
					<div className={s.stack} role="menu" aria-label="Add">
						{actions.map((a, i) => {
							const look = LOOK[a.kind];
							return (
								<button key={a.kind} role="menuitem" className={s.action} onClick={() => pick(a)}
									// From the bottom up, nearest the + first.
									style={{ animationDelay: `${(actions.length - 1 - i) * 25}ms` }}>
									<span className={`${s.icon} ${look.ink === "var(--on-accent)" ? s.solid : ""}`} style={{ "--tint": look.tint, "--ink": look.ink } as CSSProperties}>{look.icon}</span>
									{look.label}
								</button>
							);
						})}
					</div>
				</>
			)}
		</>
	);
}
