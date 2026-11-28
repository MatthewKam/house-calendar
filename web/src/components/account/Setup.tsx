import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SignedIn } from '../../lib/api';
import { isApp } from '../../lib/native';
import type { SetupKind } from '../../lib/setup';
import { keys, useAuthStatus, useMembers } from '../../lib/queries';
import { PALETTE } from '../../lib/color';
import { isKid } from '../../lib/people';
import { starterTasks, type StarterTask } from '../../lib/tasks';
import type { Member } from '../../lib/types';
import PhoneCalendars from '../settings/PhoneCalendars';
import ChildConsent from '../settings/ChildConsent';
import GoogleCalendars from '../settings/GoogleCalendars';
import ICloudCalendars from '../settings/ICloudCalendars';
import { Issued } from '../settings/HouseholdAccess';
import { GetTheApp } from './SignIn';
import { tapArea } from '../../lib/haptics';
import { usePush } from '../../lib/usePush';
import s from './styles/Account.module.css';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Input } from '../ui/Field';

const STEPS = ['kids', 'tasks', 'calendar', 'alerts', 'invite'] as const;
type Step = (typeof STEPS)[number];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * Right after starting a household, on that device: a few steps, one per screen, each skippable. The kids
 * (name and birthday), starter tasks for their ages, your phone's calendars, alerts on this device, and
 * inviting the other parent. A parent who joins gets just the calendar and alerts steps, for their own phone.
 * Anything skipped is still in Settings.
 */
export default function Setup({ status, kind, onDone }: { status: SignedIn; kind: SetupKind; onDone: () => void }) {
	const kids = (useMembers().data ?? []).filter(isKid);
	const push = usePush();
	// Alerts once they're known to be possible here and still off; kept once offered, as turning them on
	// (or saying no) changes that while on the step.
	const [offerAlerts, setOfferAlerts] = useState(false);
	if (push.state === 'off' && !offerAlerts) setOfferAlerts(true);
	const steps = STEPS.filter(
		(x) =>
			(kind === 'started' || x === 'calendar' || x === 'alerts') &&
			// Starter tasks only make sense once there's a kid to give them to.
			(x !== 'tasks' || kids.length > 0) &&
			(x !== 'alerts' || offerAlerts),
	);
	// Back from Google's pages (…/?calendar=connected, or what went wrong): straight back to the calendar step.
	const [googleResult] = useState(() => new URLSearchParams(window.location.search).get('calendar'));
	useEffect(() => {
		if (!googleResult) return;
		const url = new URL(window.location.href);
		url.searchParams.delete('calendar');
		history.replaceState(null, '', url.pathname + url.search + url.hash);
	}, [googleResult]);
	const [step, setStep] = useState<Step>(googleResult && steps.includes('calendar') ? 'calendar' : steps[0]);
	const at = steps.indexOf(step);
	const next = () => (at + 1 < steps.length ? setStep(steps[at + 1]) : onDone());

	return (
		<main className={s.screen} {...tapArea}>
			<div className={s.column}>
				<ol className={s.steps} aria-label={`Step ${at + 1} of ${steps.length}`}>
					{steps.map((x, i) => (
						<li key={x} className={s.stepDot} aria-current={i === at ? 'step' : undefined} />
					))}
				</ol>
				{step === 'kids' && <Kids kids={kids} onNext={next} />}
				{step === 'tasks' && <Tasks kids={kids} onNext={next} />}
				{step === 'calendar' && (
					<Calendar
						joined={kind === 'joined'}
						onNext={next}
						last={at === steps.length - 1}
						googleResult={googleResult}
					/>
				)}
				{step === 'alerts' && <Alerts push={push} onNext={next} last={at === steps.length - 1} />}
				{step === 'invite' && <Invite household={status.household?.name ?? 'your family'} onNext={next} />}
			</div>
		</main>
	);
}

/** Next when something's been done on a step, Skip when not. */
function NextButton({ done, onNext, last }: { done: boolean; onNext: () => void; last?: boolean }) {
	return done ? (
		<Button variant="primary" size="lg" block onClick={onNext}>
			{last ? 'Finish' : 'Next'}
		</Button>
	) : (
		<Button variant="link" className={s.link} onClick={onNext}>
			Skip for now
		</Button>
	);
}

/**
 * The kids: a name and a birthday each (the birthday sets their stage: games, tasks and how they earn). A
 * parent's OK comes first (COPPA): until a guardian has given it, the step is Children's privacy (what Sprig
 * stores about a child, and the emailed code), and the form shows once they have.
 */
export function Kids({ kids, last, onNext }: { kids: Member[]; last?: boolean; onNext: () => void }) {
	const qc = useQueryClient();
	const members = useMembers().data ?? [];
	const auth = useAuthStatus().data;
	// Signed out (the wall from before accounts) there's nothing to ask.
	const consented = !auth?.signedIn || !!auth.household?.childConsent;
	const [name, setName] = useState('');
	const [birthdate, setBirthdate] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function add(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const m = await api.addMember({ name: name.trim(), color: PALETTE[members.length % PALETTE.length] });
			// No birthday, no kid: someone half made is taken out again, so a refused birthday leaves nobody behind.
			await api.updateMember(m.id, { birthdate }).catch(async (err: unknown) => {
				await api.deleteMember(m.id).catch(() => {});
				throw err;
			});
			setName('');
			setBirthdate('');
			await qc.invalidateQueries({ queryKey: keys.members });
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	if (!consented)
		return (
			<>
				<h1 className={s.title}>Your kids</h1>
				<ChildConsent hasChildren={false} />
				<NextButton done={false} onNext={onNext} last={last} />
			</>
		);

	return (
		<>
			<h1 className={s.title}>Your kids</h1>
			<p className={s.lead}>Their birthday picks the right tasks and rewards for their age.</p>
			{kids.length > 0 && (
				<ul className={s.people}>
					{kids.map((k) => (
						<li key={k.id} className={s.person}>
							<span className={s.dot} style={{ background: k.color }} />
							<span className={s.who}>{k.name}</span>
						</li>
					))}
				</ul>
			)}
			<form className={s.card} onSubmit={add}>
				<Input
					placeholder={kids.length ? 'Another kid' : 'Name'}
					aria-label="Kid's name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					maxLength={40}
				/>
				<label className={s.hint}>
					Birthday
					<Input
						type="date"
						aria-label="Birthday"
						value={birthdate}
						max={new Date().toISOString().slice(0, 10)}
						onChange={(e) => setBirthdate(e.target.value)}
					/>
				</label>
				{error && <p className={s.error}>{error}</p>}
				<Button variant="primary" size="lg" block type="submit" disabled={busy || !name.trim() || !birthdate}>
					{kids.length ? 'Add another' : 'Add'}
				</Button>
			</form>
			<NextButton done={kids.length > 0} onNext={onNext} last={last} />
		</>
	);
}

/** A few tasks for each kid's age, all picked to start with; a tap leaves one out. */
export function Tasks({ kids, onNext }: { kids: Member[]; onNext: () => void }) {
	const qc = useQueryClient();
	const offers = kids.flatMap((k) => starterTasks(k.stage).map((t, i) => ({ key: `${k.id}:${i}`, kid: k, t })));
	const [left, setLeft] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const picked = offers.filter((o) => !left.has(o.key));
	const toggle = (key: string) =>
		setLeft((l) => {
			const n = new Set(l);
			if (!n.delete(key)) n.add(key);
			return n;
		});

	async function add() {
		setBusy(true);
		setError(null);
		try {
			for (const { kid, t } of picked) await api.addTask(taskFor(kid.id, t));
			await qc.invalidateQueries({ queryKey: keys.tasks });
			onNext();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<h1 className={s.title}>Starter tasks</h1>
			<p className={s.lead}>A few every-day tasks for their ages. Tap one to leave it out; change any later.</p>
			{kids.map((k) => {
				const mine = offers.filter((o) => o.kid.id === k.id);
				if (mine.length === 0) return null;
				return (
					<section key={k.id} className={s.card} aria-label={k.name}>
						<h2>{k.name}</h2>
						<div className={s.choices}>
							{mine.map((o) => (
								<Chip
									key={o.key}

									pressed={!left.has(o.key)}
									onClick={() => toggle(o.key)}
								>
									{o.t.icon} {o.t.title}
									{o.t.time && <span className={s.choiceNote}> · {o.t.time}</span>}
								</Chip>
							))}
						</div>
					</section>
				);
			})}
			{error && <p className={s.error}>{error}</p>}
			{picked.length > 0 && (
				<Button variant="primary" size="lg" block disabled={busy} onClick={() => void add()}>
					Add {picked.length} {picked.length === 1 ? 'task' : 'tasks'}
				</Button>
			)}
			<Button variant="link" className={s.link} onClick={onNext}>
				Skip for now
			</Button>
		</>
	);
}

const taskFor = (memberId: string, t: StarterTask) => ({
	title: t.title,
	icon: t.icon,
	memberId,
	days: EVERY_DAY,
	time: t.time,
	category: t.category,
	required: true,
	points: 0,
	dueBy: null,
});

/**
 * Your calendars, connected right here: on the iPhone its own calendars in a tap (no password); everywhere
 * Google (Google's pages, then back) and iCloud (an app-specific password), as in Settings → Calendars. On
 * the website, the App Store for the phone's own calendars. Next once something of yours is connected.
 */
export function Calendar({
	joined,
	last,
	onNext,
	googleResult,
}: {
	joined: boolean;
	last: boolean;
	onNext: () => void;
	/** Back from Google: 'connected', or what went wrong. */
	googleResult?: string | null;
}) {
	const [shared, setShared] = useState(false);
	const members = useMembers().data ?? [];
	const status = useAuthStatus().data;
	const me = status?.signedIn ? status.memberId : null;
	const connections = useQuery({ queryKey: ['connections'], queryFn: api.connections }).data;
	const connected =
		!!me && [...(connections?.google ?? []), ...(connections?.icloud ?? [])].some((c) => c.memberId === me);
	// Signed in with Apple: iCloud's steps come first, already open, with their Apple ID (unless Apple hides it).
	// Signed in with Google: Google first.
	const signIns = (status?.signedIn && status.signIns) || [];
	const apple = signIns.includes('apple');
	const email = status?.signedIn ? (status.user?.email ?? '') : '';
	const google = connections?.google && (
		<>
			<h2 className={s.subhead}>Google Calendar</h2>
			<GoogleCalendars members={members} />
		</>
	);
	const icloud = connections?.icloud && (
		<>
			<h2 className={s.subhead}>iCloud Calendar</h2>
			<ICloudCalendars
				members={members}
				startOpen={apple}
				appleId={apple && !email.endsWith('@privaterelay.appleid.com') ? email : ''}
			/>
		</>
	);
	return (
		<>
			<h1 className={s.title}>Your calendar</h1>
			<p className={s.lead}>
				{joined ? 'Share your calendar with the family too, ' : 'Bring in your calendar, '}so everyone's events are in
				one place.
			</p>
			{googleResult && (
				<p className={googleResult === 'connected' ? s.hint : s.error} role="status">
					{googleResult === 'connected'
						? 'Google Calendar connected. Its events will show in a moment.'
						: `Google Calendar: ${googleResult}`}
				</p>
			)}
			{isApp && (
				<>
					<h2 className={s.subhead}>This iPhone's calendars</h2>
					<PhoneCalendars onShared={() => setShared(true)} />
				</>
			)}
			{apple ? (
				<>
					{icloud}
					{google}
				</>
			) : (
				<>
					{google}
					{icloud}
				</>
			)}
			{!isApp && (
				<>
					<h2 className={s.subhead}>Your iPhone's calendars</h2>
					<p className={s.hint}>In the Sprig app, share your iPhone's calendars in one tap, with no password.</p>
					<GetTheApp />
				</>
			)}
			<NextButton done={shared || connected} onNext={onNext} last={last} />
		</>
	);
}

/**
 * Alerts on this device: Sprig's own reason first, then the iPhone's (or browser's) "Allow notifications?",
 * which it shows only once. Asking puts Sprig in the iPhone's Settings → Notifications, either way.
 */
export function Alerts({
	push,
	last,
	onNext,
}: {
	push: ReturnType<typeof usePush>;
	last?: boolean;
	onNext: () => void;
}) {
	const { state, busy, error, turnOn } = push;
	return (
		<>
			<h1 className={s.title}>Alerts</h1>
			<p className={s.lead}>
				Get a nudge on this {isApp ? 'phone' : 'device'} when a reminder on your lists comes due, and when it's time to
				leave.
			</p>
			{state === 'on' ? (
				<p className={s.hint} role="status">
					Alerts are on. Turn them off any time in Settings → Notifications.
				</p>
			) : state === 'blocked' ? (
				<p className={s.hint} role="status">
					{isApp
						? "Alerts are off for Sprig on this iPhone. To turn them on later, go to the iPhone's Settings → Notifications → Sprig."
						: "Alerts are blocked for Sprig in this browser. To turn them on later, allow notifications for this site in the browser's settings."}
				</p>
			) : (
				<Button variant="primary" size="lg" block disabled={busy || state !== 'off'} onClick={() => void turnOn()}>
					Turn on alerts
				</Button>
			)}
			{error && <p className={s.error}>{error}</p>}
			<NextButton done={state === 'on' || state === 'blocked'} onNext={onNext} last={last} />
			{state === 'off' && <p className={s.hint}>You can turn them on any time in Settings → Notifications.</p>}
		</>
	);
}

/** The other parent (or a grandparent): a code and a link to send them. */
export function Invite({ household, onNext }: { household: string; onNext: () => void }) {
	const [name, setName] = useState('');
	const [issued, setIssued] = useState<{ code: string; expiresAt: string; what: string } | null>(null);
	// Someone's been invited (the code may be closed again, to invite another).
	const [invited, setInvited] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function invite(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const who = name.trim();
			const r = await api.invite({ kind: 'guardian', name: who });
			setIssued({ ...r, what: `${who} (guardian)` });
			setInvited(true);
			setName('');
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<h1 className={s.title}>Invite family</h1>
			<p className={s.lead}>
				Send the other parent a link to join {household}. When they join, Sprig helps them share their phone's calendar
				too. Grandparents can come too.
			</p>
			{issued ? (
				<Issued {...issued} onClose={() => setIssued(null)} />
			) : (
				<form className={s.card} onSubmit={invite}>
					<Input
						placeholder="Their name"
						aria-label="Their name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						maxLength={40}
					/>
					{error && <p className={s.error}>{error}</p>}
					<Button variant="primary" size="lg" block type="submit" disabled={busy || !name.trim()}>
						Get a link
					</Button>
				</form>
			)}
			<NextButton done={invited} onNext={onNext} last />
		</>
	);
}
