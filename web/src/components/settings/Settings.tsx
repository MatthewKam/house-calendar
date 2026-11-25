import { useEffect, useRef, useState } from 'react';
import { useSettingsGroup } from '../../lib/usePage';
import { useAuthStatus, useCalendars, useLearn, useSettings } from '../../lib/queries';
import { dayKey } from '../../lib/dates';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from '../../lib/useMediaQuery';
import { usePush } from '../../lib/usePush';
import type { Member } from '../../lib/types';
import { DeleteAccount, SignedInAs, SignOut } from './Account';
import Passkeys from './Passkeys';
import AlertsSetting, { ALERTS_NOTE } from './AlertsSetting';
import AppearanceSettings from './AppearanceSettings';
import CalendarList from './CalendarList';
import DailyCardSettings from './DailyCardSettings';
import FamilyMembers from './FamilyMembers';
import GoogleCalendars from './GoogleCalendars';
import HomeAddress from './HomeAddress';
import HouseholdAccess from './HouseholdAccess';
import ICloudCalendars from './ICloudCalendars';
import PhoneCalendars, { SharingPhones } from './PhoneCalendars';
import { isApp } from '../../lib/native';
import LearnSettings, { LearnAbout, learnNote } from './LearnSettings';
import ScreenSettings from './ScreenSettings';
import { Group, InfoButton, Section, SettingsView } from './parts';
import s from './styles/Settings.module.css';
import { LEARN_ON } from '../../lib/features';
import { IconButton } from '../ui/Button';

interface Props {
	members: Member[];
	/** Leaves Settings for the app's first page (after kid mode or wall mode starts, or another household). */
	onLeave: () => void;
	/** Starts kid mode on this device (when there are kids, and it isn't a kid's own). */
	onKidMode?: () => void;
}

/** A group's part of the address: "Daily cards" is #settings/daily-cards. */
const slug = (title: string) => title.toLowerCase().replace(/\s+/g, '-');

/**
 * Settings, a page of its own: who's signed in at the top, then a row for each group (Family, Calendars,
 * Learning, Appearance, Daily cards, Screen, Notifications, Users), the way to reach us, and Sign out.
 * On a phone a group opens in place of the list, with ‹ Settings back; on anything bigger the list
 * stays on the left and the group shows beside it (Family to start). Each group has an address of its
 * own (#settings/users). Changes save as they're made. Each group's parts are in this folder; parts.tsx
 * has the pieces they're built from (Group, Section, SwitchRow, the ⓘ).
 */
export default function Settings({ members, onLeave, onKidMode }: Props) {
	const today = dayKey(new Date());
	const learn = useLearn(today).data ?? [];
	// For the groups' rows: how each one is set.
	const settings = useSettings().data;
	const homeAddress = ((settings?.homeAddress as string | undefined) ?? '').trim();
	const calendarCount = (useCalendars().data ?? []).length;
	const hasCalendars = calendarCount > 0;
	const push = usePush();
	// Both asked every time (hooks can't be skipped).
	const upright = useMediaQuery(PHONE);
	const sideways = useMediaQuery(PHONE_SIDEWAYS);
	const phone = upright || sideways;
	// Alerts and wall mode are a grown-up's own device's (not the wall's or a kid's device).
	const auth = useAuthStatus().data;
	const grownUp = !!auth?.signedIn && auth.role === 'guardian' && auth.kind === 'user';
	const wallModeOn = !!auth?.signedIn && auth.wallMode;
	const isWall = wallModeOn || (!!auth?.signedIn && auth.kind === 'wall');

	// The groups this device has.
	const shows = {
		// Hidden while Learn is off (lib/features.ts).
		learning: LEARN_ON,
		// A grown-up's own, and the wall's (also on a home server, with no accounts). Not on a kid's device.
		dailyCards: grownUp || isWall || !auth?.signedIn,
		// Empty on a phone that isn't a grown-up's own, with no kids.
		screen: grownUp || wallModeOn || !phone || !!onKidMode,
		// What this phone tells you: a grown-up's own phone's only.
		notifications: grownUp,
	};
	const titles = [
		'Family',
		'Calendars',
		...(shows.learning ? ['Learning'] : []),
		'Appearance',
		...(shows.dailyCards ? ['Daily cards'] : []),
		...(shows.screen ? ['Screen'] : []),
		...(shows.notifications ? ['Notifications'] : []),
		'Users',
	];

	// The group showing, from the address: on a phone none is the list; bigger, Family to start. One this
	// device hasn't (an old link) is the same as none.
	const address = useSettingsGroup();
	const view = titles.find((title) => slug(title) === address.group) ?? (phone ? null : 'Family');
	// A phone goes in from the list (a step to go back through); bigger, one takes another's place.
	const pick = (title: string) => address.open(slug(title), phone);
	// How Learning works, shown with the ⓘ by its title.
	const [learnInfo, setLearnInfo] = useState(false);
	// Each group starts at its top.
	const viewScroll = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (viewScroll.current) viewScroll.current.scrollTop = 0;
	}, [view]);

	// Every group: the list shows their rows, the view the picked one's settings.
	const groups = (
		<>
			<Group title="Family">
				<Section title="Household" note={members.map((m) => m.name).join(', ')}>
					<FamilyMembers members={members} />
				</Section>
				<Section title="Home address" note={homeAddress || 'Not set'}>
					<HomeAddress />
				</Section>
			</Group>

			{/* Its own group: the phone's, iCloud's and Google's calendars, and whose each one is. */}
			<Group title="Calendars" note={calendarsNote(calendarCount)}>
				<div className={s.foldBody}>
					<PhoneCalendars />
					<SharingPhones members={members} />
					{isApp && (
						<p className={s.hint}>
							Or keep iCloud in step all the time, even when no one opens Sprig, with an app-specific password:
						</p>
					)}
					<ICloudCalendars members={members} />
					<GoogleCalendars members={members} />
					{hasCalendars && <CalendarList members={members} />}
				</div>
			</Group>

			{/* A big one: its own group, not folded inside Family. Hidden while Learn is off (lib/features.ts). */}
			{LEARN_ON && (
				<Group title="Learning" note={learnNote(learn, members)}>
					<div className={s.foldBody}>
						{learnInfo && <LearnAbout />}
						<LearnSettings members={members} today={today} />
					</div>
				</Group>
			)}

			<Group title="Appearance">
				<AppearanceSettings />
			</Group>

			{/* The themes the daily quote and encouragement come from: a grown-up's own, and the wall's (also
			    on a home server, with no accounts). Not on a kid's device. */}
			{shows.dailyCards && (
				<Group title="Daily cards">
					<DailyCardSettings me={grownUp && auth?.signedIn ? auth.memberId : null} />
				</Group>
			)}

			{/* Empty on a phone that isn't a grown-up's own, with no kids: no group at all then. */}
			{shows.screen && (
				<Group title="Screen">
					<ScreenSettings
						wallMode={grownUp || wallModeOn}
						wallModeOn={wallModeOn}
						screenSaver={!phone}
						onKidMode={onKidMode}
						onClose={onLeave}
					/>
				</Group>
			)}

			{/* Its own group: what this phone tells you, and more to come. A grown-up's own phone's only. */}
			{grownUp && (
				<Group title="Notifications" note={ALERTS_NOTE[push.state]}>
					{/* A dropdown each: alerts now, more to come. */}
					<Section title="Alerts" note={ALERTS_NOTE[push.state]}>
						<AlertsSetting push={push} />
					</Section>
				</Group>
			)}

			{/* Who signs in and how (invites, PINs, devices): its own group. */}
			<Group title="Users">
				<div className={s.foldBody}>
					<HouseholdAccess />
					{/* Someone's own account (not a kid's device, the wall, or wall mode). */}
					{auth?.signedIn && auth.kind === 'user' && !auth.wallMode && !auth.demo && <Passkeys />}
					{auth?.signedIn && auth.kind === 'user' && !auth.wallMode && <DeleteAccount onClose={onLeave} />}
				</div>
			</Group>
		</>
	);

	const viewTitle = view && (
		<>
			{phone && (
				<IconButton
					size="lg"
					className={s.back}
					label="Back to Settings"
					icon={<span className={s.backIcon}>‹</span>}
					onClick={address.close}
				/>
			)}
			{view}
			{view === 'Learning' && (
				<InfoButton about="Learning" open={learnInfo} onToggle={() => setLearnInfo(!learnInfo)} />
			)}
		</>
	);
	const viewBody = view && (
		<SettingsView.Provider value={{ view, open: pick, rows: false }}>{groups}</SettingsView.Provider>
	);

	// Who's signed in, the groups, how to reach us, and (last, away from everything else) Sign out.
	const list = (
		<>
			{auth?.signedIn && <SignedInAs status={auth} onClose={onLeave} />}
			<SettingsView.Provider value={{ view: phone ? null : view, open: pick, rows: true }}>
				<div className={s.groupRows}>{groups}</div>
			</SettingsView.Provider>
			{/* Not on a kid's device: a tap there would start an email. */}
			{auth?.signedIn && auth.kind !== 'device' && (
				<p className={s.help}>
					Questions, a problem or an idea? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
				</p>
			)}
			{auth?.signedIn && (
				<div className={s.signOut}>
					<SignOut status={auth} onClose={onLeave} />
				</div>
			)}
		</>
	);

	// A phone: the list, or one group in its place.
	if (phone) {
		return (
			<section className={s.page} aria-label="Settings">
				<header className={s.pageHead}>
					<h1 className={`${s.pageTitle} ${view ? s.viewTitle : ''}`}>{view ? viewTitle : 'Settings'}</h1>
				</header>
				<div className={s.scroll} ref={viewScroll}>
					{view ? viewBody : list}
				</div>
			</section>
		);
	}
	// Bigger: the list on the left, the group beside it.
	return (
		<section className={s.page} aria-label="Settings">
			<header className={s.pageHead}>
				<h1 className={s.pageTitle}>Settings</h1>
			</header>
			<div className={s.columns}>
				<div className={`${s.scroll} ${s.listColumn}`}>{list}</div>
				<div className={`${s.scroll} ${s.viewColumn}`} ref={viewScroll}>
					<h2 className={`${s.viewHeading} ${s.viewTitle}`}>{viewTitle}</h2>
					{viewBody}
				</div>
			</div>
		</section>
	);
}

/** Where help questions go (forwarded to the family's inbox). */
const SUPPORT_EMAIL = 'hello@sprig-family.com';

/** The word beside Calendars in Settings while it's folded: how many are connected. */
function calendarsNote(count: number): string {
	if (count === 0) return 'None yet';
	return count === 1 ? '1 calendar' : `${count} calendars`;
}
