import type { AdminHealth, HealthLevel } from '../../../../shared/admin.ts';
import { Card } from '../ui/Card';
import { Tag } from '../ui/Chip';
import { routeName } from './features';
import s from './Admin.module.css';

// The server's own health (server/health.ts): is the one machine running out of anything? Each figure with its
// level in words and a colour, so the colour is never the only sign. docs/scale.md says what to do when one
// turns amber or red.

const LEVEL: Record<HealthLevel, { word: string; tone: 'good' | 'warn' | 'danger' }> = {
	ok: { word: 'Fine', tone: 'good' },
	warn: { word: 'Watch', tone: 'warn' },
	bad: { word: 'Act now', tone: 'danger' },
};

export default function Health({ health }: { health: AdminHealth }) {
	const worst = health.gauges.some((g) => g.level === 'bad')
		? 'bad'
		: health.gauges.some((g) => g.level === 'warn')
			? 'warn'
			: 'ok';
	return (
		<Card
			title="Server health"
			tone={worst === 'bad' ? 'danger' : worst === 'warn' ? 'warn' : 'plain'}
			action={<span className={s.muted}>up since {new Date(health.startedAt).toLocaleString()}</span>}
		>
			<div className={s.gauges}>
				{health.gauges.map((g) => (
					<div key={g.id} className={s.gauge}>
						<span className={s.gaugeHead}>
							<span className={s.statLabel}>{g.label}</span>
							<Tag tone={LEVEL[g.level].tone}>{LEVEL[g.level].word}</Tag>
						</span>
						<span className={s.gaugeValue}>{g.value}</span>
						<span className={s.muted}>{g.detail}</span>
					</div>
				))}
			</div>
			{health.slowest.length > 0 && (
				<>
					<p className={s.muted}>Slowest kinds of request, last hour (95% within · slowest · how many):</p>
					<ul className={s.routes}>
						{health.slowest.map((r) => (
							<li key={r.route}>
								<code>{routeName(r.route)}</code>{' '}
								<span className={s.muted}>
									{r.p95Ms} ms · {r.maxMs} ms · {r.count}
								</span>
							</li>
						))}
					</ul>
				</>
			)}
		</Card>
	);
}
