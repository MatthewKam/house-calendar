import { useRef, useState, type ReactNode } from "react";
import type { SignedIn } from "../lib/api";
import { Avatar } from "./AccountSheet";
import s from "../styles/NavBar.module.css";

export type Page = "calendar" | "today" | "tasks" | "rewards" | "lists" | "photos";

interface Props {
	page: Page;
	settingsOpen: boolean;
	onPage: (page: Page) => void;
	onSettings: () => void;
	/** The parent lock, on the wall and kids' devices; tapping it unlocks (a guardian's PIN) or locks again. `by`: whose PIN. */
	lock?: { parent: boolean; by: string | null; onTap: () => void };
	/** Who's signed in here: their initial in their color (or the wall), opening who and Sign out. */
	me?: { status: SignedIn; onTap: () => void };
	/** Phones: a bar along the bottom (Today, Calendar, this in the middle, Tasks, More). */
	phone?: boolean;
	/** The quick-add button in the middle of the phone bar. */
	center?: ReactNode;
	/** Starts kid mode on this device (when there are kids). */
	onKidMode?: () => void;
	/** Say it and Snap a flyer (grown-ups, with Claude on the server); phones have them in the +. */
	capture?: { onSay: () => void; onSnap: (photo: File) => void };
}

// Simple line icons, drawn in the current text color.
export const TodayIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
	</svg>
);
const CalendarIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
		<path d="M3.5 10h17M8 3v4M16 3v4" />
	</svg>
);
export const TasksIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<rect x="4" y="3" width="16" height="18" rx="2.5" />
		<path d="M8 8.5l1.5 1.5L12 7.5M8 14.5l1.5 1.5 2.5-2.5M14.5 9h2M14.5 15h2" />
	</svg>
);
export const RewardsIcon = () => (
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
const KidModeIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="12" cy="13" r="7.5" />
		<circle cx="6" cy="5.8" r="2.3" />
		<circle cx="18" cy="5.8" r="2.3" />
		<path d="M9.6 12v.3M14.4 12v.3M9.5 15.6c1.4 1.2 3.6 1.2 5 0" />
	</svg>
);
const MicIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
	</svg>
);
const SnapIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
		<circle cx="12" cy="13.5" r="3.5" />
	</svg>
);
const MoreIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="5" cy="12" r="1.4" />
		<circle cx="12" cy="12" r="1.4" />
		<circle cx="19" cy="12" r="1.4" />
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

/**
 * Bar down the left edge: the Today, Calendar, Tasks, Lists, Rewards and Photos pages, Say it and Snap
 * (grown-ups), Kid mode, and the logo and Settings at the bottom.
 */
export default function NavBar({
	page,
	settingsOpen,
	onPage,
	onSettings,
	lock,
	me,
	phone,
	center,
	onKidMode,
	capture,
}: Props) {
	const snap = useRef<HTMLInputElement>(null);
	if (phone) return <BottomBar {...{ page, settingsOpen, onPage, onSettings, lock, me, center, onKidMode }} />;
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
			{item("today", "Today", <TodayIcon />)}
			{item("calendar", "Calendar", <CalendarIcon />)}
			{item("tasks", "Tasks", <TasksIcon />)}
			{item("lists", "Lists", <ListsIcon />)}
			{item("rewards", "Rewards", <RewardsIcon />)}
			{item("photos", "Photos", <PhotosIcon />)}
			{capture && (
				<>
					<button className={s.item} onClick={capture.onSay} aria-label="Say it">
						<MicIcon />
						<span className={s.label}>Say it</span>
					</button>
					{/* A tablet asks: take a photo, or pick one; a computer opens its files. */}
					<button className={s.item} onClick={() => snap.current?.click()} aria-label="Snap a flyer">
						<SnapIcon />
						<span className={s.label}>Snap</span>
					</button>
					<input ref={snap} type="file" accept="image/*" hidden onChange={(e) => {
						const photo = e.target.files?.[0];
						e.target.value = "";
						if (photo) capture.onSnap(photo);
					}} />
				</>
			)}
			{onKidMode && (
				<button className={s.item} onClick={onKidMode} aria-label="Kid mode">
					<KidModeIcon />
					<span className={s.label}>Kid mode</span>
				</button>
			)}
			{/* Pinned to the bottom of the bar: who's signed in, the parent lock, then Settings. */}
			{me ? (
				<button className={`${s.item} ${s.me}`} onClick={me.onTap}
					aria-label={`Signed in as ${me.status.me?.name ?? "the wall"}`}>
					<Avatar status={me.status} />
					<span className={s.label}>{me.status.me?.name.split(" ")[0] ?? "Wall"}</span>
				</button>
			) : (
				<img className={s.logo} src="/favicon.svg" alt="" />
			)}
			{lock && (
				<button
					className={`${s.item} ${lock.parent ? s.unlocked : ""}`}
					onClick={lock.onTap}
					aria-label={lock.parent ? `Unlocked${lock.by ? ` by ${lock.by}` : ""}: tap to lock` : "Unlock (guardians)"}
				>
					<LockIcon open={lock.parent} />
					<span className={s.label}>{lock.parent ? lock.by ?? "Unlocked" : "Locked"}</span>
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

/** Pages behind More on a phone. */
const MORE: [Page, string, () => ReactNode][] = [
	["lists", "Lists", ListsIcon],
	["rewards", "Rewards", RewardsIcon],
	["photos", "Photos", PhotosIcon],
];

/**
 * Phones: Today, Calendar ("Cal"), the quick-add button, Tasks and More along the bottom, in thumb's reach.
 * More holds the other pages, who's signed in, the parent lock and Settings.
 */
function BottomBar({ page, settingsOpen, onPage, onSettings, lock, me, center, onKidMode }: Omit<Props, "phone">) {
	const [more, setMore] = useState(false);
	const inMore = MORE.some(([p]) => p === page);
	// `short`: a shorter name to show (the full one still read out).
	const tab = (p: Page, label: string, icon: ReactNode, short?: string) => (
		<button className={`${s.tab} ${page === p ? s.tabOn : ""}`} aria-current={page === p ? "page" : undefined}
			aria-label={short ? label : undefined} onClick={() => onPage(p)}>
			{icon}
			<span>{short ?? label}</span>
		</button>
	);
	// Picking from More closes it.
	const then = (act: () => void) => () => {
		setMore(false);
		act();
	};
	return (
		<>
			<nav className={s.bar} aria-label="Main">
				{tab("today", "Today", <TodayIcon />)}
				{tab("calendar", "Calendar", <CalendarIcon />, "Cal")}
				<div className={s.center}>{center}</div>
				{tab("tasks", "Tasks", <TasksIcon />)}
				<button className={`${s.tab} ${inMore || more || settingsOpen ? s.tabOn : ""}`} aria-expanded={more}
					onClick={() => setMore(!more)}>
					<MoreIcon />
					<span>More</span>
				</button>
			</nav>
			{more && (
				<>
					<div className={s.moreScrim} onClick={() => setMore(false)} role="presentation" />
					<div className={s.moreSheet} role="dialog" aria-label="More">
						{MORE.map(([p, label, Icon]) => (
							<button key={p} className={`${s.moreItem} ${page === p ? s.moreOn : ""}`} onClick={then(() => onPage(p))}>
								<Icon />
								{label}
							</button>
						))}
						{onKidMode && (
							<button className={s.moreItem} onClick={then(onKidMode)}>
								<KidModeIcon />
								Kid mode
							</button>
						)}
						<hr className={s.moreRule} />
						{me && (
							<button className={s.moreItem} onClick={then(me.onTap)}>
								<span className={s.moreAvatar}><Avatar status={me.status} /></span>
								{me.status.me?.name ?? "The wall"}
							</button>
						)}
						{lock && (
							<button className={`${s.moreItem} ${lock.parent ? s.unlocked : ""}`} onClick={then(lock.onTap)}>
								<LockIcon open={lock.parent} />
								{lock.parent ? `Unlocked${lock.by ? ` by ${lock.by}` : ""}: tap to lock` : "Locked: unlock for grown-ups"}
							</button>
						)}
						<button className={s.moreItem} onClick={then(onSettings)}>
							<SettingsIcon />
							Settings
						</button>
					</div>
				</>
			)}
		</>
	);
}
