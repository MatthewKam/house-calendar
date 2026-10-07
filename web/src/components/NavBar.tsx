import type { ReactNode } from 'react';
import s from '../styles/NavBar.module.css';

export type Page = 'calendar' | 'tasks' | 'lists';

interface Props {
  page: Page;
  settingsOpen: boolean;
  onPage: (page: Page) => void;
  onSettings: () => void;
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
const ListsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.75" cy="6.5" r="1.25" />
    <circle cx="4.75" cy="12" r="1.25" />
    <circle cx="4.75" cy="17.5" r="1.25" />
  </svg>
);
const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

/** Bar down the left edge: the Calendar, Tasks and Lists pages, and the logo and Settings at the bottom. */
export default function NavBar({ page, settingsOpen, onPage, onSettings }: Props) {
  const item = (p: Page, label: string, icon: ReactNode) => (
    <button className={`${s.item} ${page === p ? s.on : ''}`} aria-current={page === p ? 'page' : undefined}
      onClick={() => onPage(p)} aria-label={label}>
      {icon}
      <span className={s.label}>{label}</span>
    </button>
  );
  return (
    <nav className={s.nav} aria-label="Main">
      {item('calendar', 'Calendar', <CalendarIcon />)}
      {item('tasks', 'Tasks', <TasksIcon />)}
      {item('lists', 'Lists', <ListsIcon />)}
      {/* Pinned to the bottom of the bar: the logo, then Settings. */}
      <img className={s.logo} src="/favicon.svg" alt="" />
      <button className={`${s.item} ${settingsOpen ? s.on : ''}`} aria-pressed={settingsOpen} onClick={onSettings}
        aria-label="Settings">
        <SettingsIcon />
        <span className={s.label}>Settings</span>
      </button>
    </nav>
  );
}
