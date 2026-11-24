import { useEffect, useRef, useState } from 'react';
import { useBackStep } from '../../lib/useBackStep';
import { useAuthStatus, useCalendars, useLearn, useSettings } from '../../lib/queries';
import { dayKey } from '../../lib/dates';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from '../../lib/useMediaQuery';
import { usePush } from '../../lib/usePush';
import type { Member } from '../../lib/types';
import Sheet from '../ui/Sheet';
import { DeleteAccount, SignedInAs, SignOut } from './Account';
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
import sheet from '../ui/styles/Sheet.module.css';
import s from './styles/Settings.module.css';
import { LEARN_ON } from '../../lib/features';
import { Button, IconButton } from '../ui/Button';

interface Props {
	members: Member[];
	onClose: () => void;
	/** Starts kid mode on this device (when there are kids, and it isn't a kid's own). */
	onKidMode?: () => void;
}

/**
 * Settings: who's signed in at the top, then a row for each group (Family, Learning, Appearance, Daily cards,
 * Screen, Notifications, Users), each opening as a view of its own with a back arrow; Sign out at the bottom.
 * Changes save as they're made. Each group's parts are in this folder; parts.tsx has the pieces they're
 * built from (Group, Section, SwitchRow, the ⓘ).
 */
export default function Settings({ members, onClose, onKidMode }: Props) {
	const today = dayKey(new Date());
	const learn = useLearn(today).data ?? [];
	// For the folded sections' summaries.
	const settings = useSettings().data;
	const homeAddress = ((settings?.homeAddress as string | undefined) ?? '').trim();
	const hasCalendars = (useCalendars().data ?? []).length > 0;
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
	// The group showing (null: the list), back at the top each time it changes.
	const [view, setView] = useState<string | null>(null);
	// A group is a step of its own: Back or a swipe goes back to the list of groups.
	useBackStep(view !== null, () => setView(null));
	// How Learning works, shown with the ⓘ by its title.
	const [learnInfo, setLearnInfo] = useState(false);
	const top = useRef<HTMLElement>(null);
	// The sheet itself scrolls (its title stays pinned, so scrolling that into view would do nothing).
	useEffect(() => {
		const sheetBox = top.current?.parentElement;
		if (sheetBox) sheetBox.scrollTop = 0;
	}, [view]);

	return (
		// Phones: the whole screen, like a page of its own.
		<Sheet label="Settings" onClose={onClose} className={phone ? sheet.full : undefined}>
			<header className={sheet.head} ref={top}>
				{view === null ? (
					<h2 className={sheet.heading}>Settings</h2>
				) : (
					<h2 className={`${sheet.heading} ${s.viewTitle}`}>
						<IconButton
							size="lg"
							className={s.back}
							label="Back to Settings"
							icon={<span className={s.backIcon}>‹</span>}
							onClick={() => setView(null)}
						/>
						{view}
						{view === 'Learning' && (
							<InfoButton about="Learning" open={learnInfo} onToggle={() => setLearnInfo(!learnInfo)} />
						)}
					</h2>
				)}
				<IconButton className={sheet.close} label="Close Settings" icon="×" onClick={onClose} />
			</header>
			<SettingsView.Provider value={{ view, open: setView }}>
				{view === null && auth?.signedIn && <SignedInAs status={auth} onClose={onClose} />}

				<Group title="Family">
					<Section title="Household" note={members.map((m) => m.name).join(', ')}>
						<FamilyMembers members={members} />
					</Section>
					<Section title="Home address" note={homeAddress || 'Not set'}>
						<HomeAddress />
					</Section>
					<Section title="Calendars">
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
					</Section>
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
				{(grownUp || isWall || !auth?.signedIn) && (
					<Group title="Daily cards">
						<DailyCardSettings me={grownUp && auth?.signedIn ? auth.memberId : null} />
					</Group>
				)}

				{/* Empty on a phone that isn't a grown-up's own, with no kids: no group at all then. */}
				{(grownUp || wallModeOn || !phone || !!onKidMode) && (
					<Group title="Screen">
						<ScreenSettings
							wallMode={grownUp || wallModeOn}
							wallModeOn={wallModeOn}
							screenSaver={!phone}
							onKidMode={onKidMode}
							onClose={onClose}
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
						{auth?.signedIn && auth.kind === 'user' && !auth.wallMode && <DeleteAccount onClose={onClose} />}
					</div>
				</Group>
			</SettingsView.Provider>

			{/* Signing out (or locking the wall) last, away from everything else. */}
			<div className={sheet.actions}>
				{view === null && auth?.signedIn && <SignOut status={auth} onClose={onClose} />}
				<span className={sheet.spacer} />
				<Button type="submit" onClick={onClose}>
					Done
				</Button>
			</div>
		</Sheet>
	);
}
