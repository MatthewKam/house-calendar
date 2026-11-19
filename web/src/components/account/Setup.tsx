import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type SignedIn } from '../../lib/api';
import { isApp } from '../../lib/native';
import type { SetupKind } from '../../lib/setup';
import { keys, useMembers } from '../../lib/queries';
import { PALETTE } from '../../lib/color';
import { isKid } from '../../lib/people';
import { starterTasks, type StarterTask } from '../../lib/tasks';
import type { Member } from '../../lib/types';
import PhoneCalendars from '../settings/PhoneCalendars';
import { Issued } from '../settings/HouseholdAccess';
import s from './Account.module.css';

const STEPS = ['kids', 'tasks', 'calendar', 'invite'] as const;
type Step = (typeof STEPS)[number];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * Right after starting a household, on that device: a few steps, one per screen, each skippable. The kids
 * (name and birthday), starter tasks for their ages, your phone's calendars, and inviting the other parent.
 * A parent who joins gets just the calendar step, for their own phone. Anything skipped is still in Settings.
 */
export default function Setup({ status, kind, onDone }: { status: SignedIn; kind: SetupKind; onDone: () => void }) {
	const kids = (useMembers().data ?? []).filter(isKid);
	const steps = STEPS.filter(
		(x) =>
			(kind === 'started' || x === 'calendar') &&
			// Starter tasks only make sense once there's a kid to give them to.
			(x !== 'tasks' || kids.length > 0),
	);
	const [step, setStep] = useState<Step>(steps[0]);
	const at = steps.indexOf(step);
	const next = () => (at + 1 < steps.length ? setStep(steps[at + 1]) : onDone());

	return (
		<main className={s.screen}>
			<div className={s.column}>
				<ol className={s.steps} aria-label={`Step ${at + 1} of ${steps.length}`}>
					{steps.map((x, i) => (
						<li key={x} className={s.stepDot} aria-current={i === at ? 'step' : undefined} />
					))}
				</ol>
				{step === 'kids' && <Kids kids={kids} onNext={next} />}
				{step === 'tasks' && <Tasks kids={kids} onNext={next} />}
				{step === 'calendar' && <Calendar joined={kind === 'joined'} onNext={next} last={at === steps.length - 1} />}
				{step === 'invite' && <Invite household={status.household?.name ?? 'your family'} onNext={next} />}
			</div>
		</main>
	);
}

/** Next when something's been done on a step, Skip when not. */
function NextButton({ done, onNext, last }: { done: boolean; onNext: () => void; last?: boolean }) {
	return done ? (
		<button type="button" className={s.primary} onClick={onNext}>
			{last ? 'Finish' : 'Next'}
		</button>
	) : (
		<button type="button" className={s.link} onClick={onNext}>
			Skip for now
		</button>
	);
}

/** The kids: a name and a birthday each (the birthday sets their stage: games, tasks and how they earn). */
function Kids({ kids, onNext }: { kids: Member[]; onNext: () => void }) {
	const qc = useQueryClient();
	const members = useMembers().data ?? [];
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
			await api.updateMember(m.id, { birthdate });
			setName('');
			setBirthdate('');
			await qc.invalidateQueries({ queryKey: keys.members });
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

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
				<input
					className={s.input}
					placeholder={kids.length ? 'Another kid' : 'Name'}
					aria-label="Kid's name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					maxLength={40}
				/>
				<label className={s.hint}>
					Birthday
					<input
						className={s.input}
						type="date"
						aria-label="Birthday"
						value={birthdate}
						max={new Date().toISOString().slice(0, 10)}
						onChange={(e) => setBirthdate(e.target.value)}
					/>
				</label>
				{error && <p className={s.error}>{error}</p>}
				<button className={s.primary} disabled={busy || !name.trim() || !birthdate}>
					{kids.length ? 'Add another' : 'Add'}
				</button>
			</form>
			<NextButton done={kids.length > 0} onNext={onNext} />
		</>
	);
}

/** A few tasks for each kid's age, all picked to start with; a tap leaves one out. */
function Tasks({ kids, onNext }: { kids: Member[]; onNext: () => void }) {
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
								<button
									key={o.key}
									type="button"
									className={s.choice}
									aria-pressed={!left.has(o.key)}
									onClick={() => toggle(o.key)}
								>
									{o.t.icon} {o.t.title}
									{o.t.time && <span className={s.choiceNote}> · {o.t.time}</span>}
								</button>
							))}
						</div>
					</section>
				);
			})}
			{error && <p className={s.error}>{error}</p>}
			{picked.length > 0 && (
				<button type="button" className={s.primary} disabled={busy} onClick={() => void add()}>
					Add {picked.length} {picked.length === 1 ? 'task' : 'tasks'}
				</button>
			)}
			<button type="button" className={s.link} onClick={onNext}>
				Skip for now
			</button>
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
 * Your calendars: on the iPhone, its own calendars in a tap (no password). On a computer, a pointer to the app;
 * iCloud by password is in Settings → Calendars for anyone who wants it.
 */
function Calendar({ joined, last, onNext }: { joined: boolean; last: boolean; onNext: () => void }) {
	const [shared, setShared] = useState(false);
	return (
		<>
			<h1 className={s.title}>Your calendar</h1>
			<p className={s.lead}>
				{joined ? 'Share your calendar with the family too, ' : 'Bring in your calendar, '}so everyone's events are in
				one place.
			</p>
			{isApp ? (
				<PhoneCalendars onShared={() => setShared(true)} />
			) : (
				<p className={s.hint}>
					Open Sprig on your iPhone to share its calendars in one tap. On a computer, iCloud can be connected in
					Settings → Calendars.
				</p>
			)}
			<NextButton done={shared} onNext={onNext} last={last} />
		</>
	);
}

/** The other parent (or a grandparent): a code and a link to send them. */
function Invite({ household, onNext }: { household: string; onNext: () => void }) {
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
					<input
						className={s.input}
						placeholder="Their name"
						aria-label="Their name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						maxLength={40}
					/>
					{error && <p className={s.error}>{error}</p>}
					<button className={s.primary} disabled={busy || !name.trim()}>
						Get a link
					</button>
				</form>
			)}
			<NextButton done={invited} onNext={onNext} last />
		</>
	);
}
