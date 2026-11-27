import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminCrash, AdminHousehold, AdminOverview, HouseholdTag } from '../../../../shared/admin.ts';
import { SERVER, authHeaders } from '../../lib/native';
import { Card } from '../ui/Card';
import { List, ListRow } from '../ui/ListRow';
import { Segmented } from '../ui/Segmented';
import { Tag } from '../ui/Chip';
import { Button } from '../ui/Button';
import DayChart, { shortDay } from './DayChart';
import Health from './Health';
import { areaName, areaOf, isAutomatic, routeName } from './features';
import s from './Admin.module.css';

// The admin page, at /admin: for the one admin (ADMIN_EMAIL) and no one else; to anyone else the server says
// it isn't there, and so does this page. Households by number only. "Real families" leaves out the admin's own
// household, their test accounts', App Review's and the site's demos. Days are UTC.

/** A signed-in device's kind, as the crash list says it. */
const DEVICES: Record<string, string> = { user: 'own sign-in', device: 'kid device', wall: 'wall' };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TAGS: Record<Exclude<HouseholdTag, null>, string> = {
	you: 'Yours',
	test: 'Your test',
	review: 'App Review',
	demo: 'Demo',
};

async function load(): Promise<AdminOverview | null> {
	const res = await fetch(`${SERVER}/api/admin/overview`, { headers: authHeaders() });
	if (res.status === 404 || res.status === 401) return null;
	if (!res.ok) throw new Error(`The admin page couldn't load (${res.status}).`);
	return res.json();
}

/** "3h ago", "2d ago". */
function ago(iso: string | null) {
	if (!iso) return 'never';
	const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
	if (mins < 60) return `${Math.max(1, mins)}m ago`;
	if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
	return `${Math.round(mins / 1440)}d ago`;
}

/** Every day from `from` to `to` (UTC). */
function dayList(from: string, to: string) {
	const out: string[] = [];
	for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000)
		out.push(new Date(t).toISOString().slice(0, 10));
	return out;
}

export default function AdminPage() {
	const q = useQuery({ queryKey: ['admin'], queryFn: load, refetchInterval: 60_000 });
	const [who, setWho] = useState<'real' | 'all'>('real');

	if (q.isPending) return <main className={s.page} aria-busy="true" />;
	if (q.isError)
		return (
			<main className={s.page}>
				<div className={s.inner}>
					<p>{q.error.message}</p>
					<Button onClick={() => void q.refetch()}>Try again</Button>
				</div>
			</main>
		);
	if (!q.data)
		return (
			<main className={s.page}>
				<div className={s.inner}>
					<p className={s.muted}>Nothing here.</p>
					<Button variant="link" onClick={() => location.assign('/')}>
						Go to Sprig
					</Button>
				</div>
			</main>
		);
	return <Overview data={q.data} who={who} setWho={setWho} />;
}

function Overview({
	data,
	who,
	setWho,
}: {
	data: AdminOverview;
	who: 'real' | 'all';
	setWho: (w: 'real' | 'all') => void;
}) {
	const tagOf = useMemo(() => new Map(data.households.map((h) => [h.number, h.tag])), [data]);
	const counts = (n: number) => who === 'all' || tagOf.get(n) === null;
	const households = data.households.filter((h) => counts(h.number));
	const days = dayList(data.from, data.to);
	const today = data.to;

	const perDay = (pick: (d: AdminOverview['days'][number]) => number) =>
		days.map((day) => data.days.filter((d) => d.day === day && counts(d.household)).reduce((a, d) => a + pick(d), 0));
	const activeHouseholds = perDay((d) =>
		d.active.user + d.active.device + d.active.wall > 0 || d.changes > 0 ? 1 : 0,
	);
	const activeDevices = perDay((d) => d.active.user + d.active.device + d.active.wall);
	const changes = perDay((d) => d.changes);
	const signUps = days.map(
		(day) => data.signUps.filter((u) => u.day === day && (who === 'all' || u.tag === null)).length,
	);
	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
	const week = Date.now() - 7 * 86_400_000;

	return (
		<main className={s.page}>
			<div className={s.inner}>
				<header className={s.head}>
					<div>
						<h1 className={s.title}>Admin</h1>
						<p className={s.muted}>
							Last {days.length} days, by UTC day. Families: real ones only, not yours, your tests, App Review or demos.
						</p>
					</div>
					<Segmented
						label="Which households"
						value={who}
						onChange={setWho}
						options={[
							{ id: 'real', label: 'Families' },
							{ id: 'all', label: 'Everyone' },
						]}
					/>
				</header>

				{data.health && <Health health={data.health} />}

				<div className={s.stats}>
					<Stat label="Households" value={households.length} />
					<Stat label="Active today" value={activeHouseholds[activeHouseholds.length - 1]} note="households" />
					<Stat label="Devices today" value={activeDevices[activeDevices.length - 1]} />
					<Stat label="Sign-ups" value={sum(signUps.slice(-30))} note="last 30 days" />
					<Stat
						label="Crashes"
						value={data.crashes.filter((c) => Date.parse(c.lastAt) > week).length}
						note="seen this week"
					/>
				</div>

				<div className={s.charts}>
					<Card>
						<DayChart title="Households active" days={days} values={activeHouseholds} />
					</Card>
					<Card>
						<DayChart title="Changes made" days={days} values={changes} />
					</Card>
					<Card>
						<DayChart title="Sign-ups" days={days} values={signUps} />
					</Card>
				</div>

				<Features data={data} counts={counts} />
				<Crashes crashes={data.crashes} tagOf={tagOf} />
				<Households households={households} today={today} />
			</div>
		</main>
	);
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
	return (
		<div className={s.stat}>
			<span className={s.statLabel}>{label}</span>
			<span className={s.statValue}>{value}</span>
			{note && <span className={s.muted}>{note}</span>}
		</div>
	);
}

/** Which parts of Sprig get used: changes over the last 30 days, by part, then each part's routes. */
function Features({ data, counts }: { data: AdminOverview; counts: (n: number) => boolean }) {
	const [open, setOpen] = useState<string | null>(null);
	const areas = new Map<string, { total: number; households: Set<number>; routes: Map<string, number> }>();
	for (const u of data.uses) {
		if (!counts(u.household)) continue;
		const area = areaOf(u.route);
		let a = areas.get(area);
		if (!a) areas.set(area, (a = { total: 0, households: new Set(), routes: new Map() }));
		a.total += u.count;
		a.households.add(u.household);
		a.routes.set(u.route, (a.routes.get(u.route) ?? 0) + u.count);
	}
	const rows = [...areas].sort((x, y) => y[1].total - x[1].total);
	const people = rows.filter(([area]) => !isAutomatic(area));
	const automatic = rows.filter(([area]) => isAutomatic(area));
	const max = Math.max(1, ...people.map(([, a]) => a.total));
	const row = ([area, a]: (typeof rows)[number]) => (
		<li key={area}>
			<button
				type="button"
				className={s.feature}
				aria-expanded={open === area}
				onClick={() => setOpen(open === area ? null : area)}
			>
				<span className={s.featureName}>{areaName(area)}</span>
				<span className={s.featureBar} aria-hidden="true">
					<span style={{ width: `${(a.total / max) * 100}%` }} />
				</span>
				<span className={s.featureCount}>
					{a.total}{' '}
					<span className={s.muted}>
						· {a.households.size} household{a.households.size === 1 ? '' : 's'}
					</span>
				</span>
			</button>
			{open === area && (
				<ul className={s.routes}>
					{[...a.routes]
						.sort((x, y) => y[1] - x[1])
						.map(([route, n]) => (
							<li key={route}>
								<code>{routeName(route)}</code> <span className={s.muted}>{n}</span>
							</li>
						))}
				</ul>
			)}
		</li>
	);
	return (
		<Card title="What gets used (last 30 days)">
			{people.length === 0 ? (
				<p className={s.muted}>Nothing yet.</p>
			) : (
				<ul className={s.features}>{people.map(row)}</ul>
			)}
			{automatic.length > 0 && (
				<>
					<p className={s.muted}>Sprig by itself (not a person):</p>
					<ul className={s.features}>{automatic.map(row)}</ul>
				</>
			)}
		</Card>
	);
}

function Crashes({ crashes, tagOf }: { crashes: AdminCrash[]; tagOf: Map<number, HouseholdTag> }) {
	const [open, setOpen] = useState<string | null>(null);
	return (
		<Card title={`Crashes (${crashes.length}, newest first)`}>
			{crashes.length === 0 ? (
				<p className={s.muted}>None. 🌱</p>
			) : (
				<List divided>
					{crashes.map((c) => {
						const real = c.households.filter((n) => tagOf.get(n) === null).length;
						const where = [
							c.source === 'server' ? 'Server' : c.platform,
							c.place,
							c.version,
							c.device && (DEVICES[c.device] ?? c.device),
						]
							.filter(Boolean)
							.join(' · ');
						return (
							<Fragment key={c.id}>
								<ListRow
									onClick={() => setOpen(open === c.id ? null : c.id)}
									title={c.message}
									detail={`${where} · last ${ago(c.lastAt)}, first ${shortDay(c.firstAt.slice(0, 10))} · ${plural(
										c.households.length,
										'household',
									)}${c.households.length ? (real ? `, ${real} real` : ', only yours') : ''}`}
									trailing={<Tag tone={real ? 'danger' : 'plain'}>×{c.count}</Tag>}
								/>
								{open === c.id && (
									<li>
										<pre className={s.stack}>{c.stack || 'No stack.'}</pre>
									</li>
								)}
							</Fragment>
						);
					})}
				</List>
			)}
		</Card>
	);
}

function Households({ households, today }: { households: AdminHousehold[]; today: string }) {
	const sorted = [...households].sort((a, b) => (b.lastActive ?? '').localeCompare(a.lastActive ?? ''));
	return (
		<Card title={`Households (${households.length}, latest active first)`}>
			<List divided>
				{sorted.map((h) => {
					const devices = h.devices.user + h.devices.device + h.devices.wall;
					return (
						<ListRow
							key={h.number}
							leading={<span className={s.number}>#{h.number}</span>}
							title={
								<>
									{h.guardians} guardian{h.guardians === 1 ? '' : 's'}, {h.kids} kid{h.kids === 1 ? '' : 's'}{' '}
									{h.tag && <Tag>{TAGS[h.tag]}</Tag>}
								</>
							}
							detail={`started ${h.createdAt.slice(0, 10) === today ? 'today' : shortDay(h.createdAt.slice(0, 10))} · ${devices} device${devices === 1 ? '' : 's'} (${h.devices.device} kid, ${h.devices.wall} wall) · active ${ago(h.lastActive)}`}
						/>
					);
				})}
			</List>
		</Card>
	);
}
