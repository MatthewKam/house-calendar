import type { ReactNode } from "react";
import s from "../styles/NavBar.module.css";

export type Page = "calendar" | "tasks" | "rewards" | "lists" | "photos";

interface Props {
	page: Page;
	settingsOpen: boolean;
	onPage: (page: Page) => void;
	onSettings: () => void;
	/** The parent lock: shown once a PIN is set; tapping it unlocks (master PIN) or locks again. */
	lock?: { parent: boolean; onTap: () => void };
}

// Simple line icons, drawn in the current text color.
const CalendarIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
		<path d="M3.5 10h17M8 3v4M16 3v4" />
	</svg>
);
const TasksIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<rect x="4" y="3" width="16" height="18" rx="2.5" />
		<path d="M8 8.5l1.5 1.5L12 7.5M8 14.5l1.5 1.5 2.5-2.5M14.5 9h2M14.5 15h2" />
	</svg>
);
const RewardsIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<rect x="3.5" y="8" width="17" height="4" rx="1" />
		<path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3.5-5-1.2C7 8 9.5 8 12 8zm0 0c1.5-3 5-3.5 5-1.2C17 8 14.5 8 12 8z" />
	</svg>
);
const ListsIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M9 6.5h11M9 12h11M9 17.5h11" />
		<circle cx="4.75" cy="6.5" r="1.25" />
		<circle cx="4.75" cy="12" r="1.25" />
		<circle cx="4.75" cy="17.5" r="1.25" />
	</svg>
);
const PhotosIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<rect x="3.5" y="5" width="17" height="14" rx="2.5" />
		<circle cx="9" cy="10" r="1.6" />
		<path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />
	</svg>
);
const LockIcon = ({ open }: { open: boolean }) => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<rect x="5" y="11" width="14" height="10" rx="2.2" />
		<path d={open ? "M8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2" : "M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"} />
	</svg>
);
const SettingsIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="12" cy="12" r="3" />
		<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
	</svg>
);

/** Bar down the left edge: the Calendar, Tasks, Rewards, Lists and Photos pages, and the logo and Settings at the bottom. */
export default function NavBar({
	page,
	settingsOpen,
	onPage,
	onSettings,
	lock,
}: Props) {
	const item = (p: Page, label: string, icon: ReactNode) => (
		<button
			className={`${s.item} ${page === p ? s.on : ""}`}
			aria-current={page === p ? "page" : undefined}
			onClick={() => onPage(p)}
			aria-label={label}
		>
			{icon}
			<span className={s.label}>{label}</span>
		</button>
	);
	return (
		<nav className={s.nav} aria-label="Main">
			{item("calendar", "Calendar", <CalendarIcon />)}
			{item("tasks", "Tasks", <TasksIcon />)}
			{item("lists", "Lists", <ListsIcon />)}
			{item("rewards", "Rewards", <RewardsIcon />)}
			{item("photos", "Photos", <PhotosIcon />)}
			{/* Pinned to the bottom of the bar: the logo, the parent lock, then Settings. */}
			<img className={s.logo} src="/favicon.svg" alt="" />
			{lock && (
				<button
					className={`${s.item} ${lock.parent ? s.unlocked : ""}`}
					onClick={lock.onTap}
					aria-label={lock.parent ? "Lock (parents)" : "Unlock (parents)"}
				>
					<LockIcon open={lock.parent} />
					<span className={s.label}>{lock.parent ? "Unlocked" : "Locked"}</span>
				</button>
			)}
			<button
				className={`${s.item} ${settingsOpen ? s.on : ""}`}
				aria-pressed={settingsOpen}
				onClick={onSettings}
				aria-label="Settings"
			>
				<SettingsIcon />
				<span className={s.label}>Settings</span>
			</button>
		</nav>
	);
}
