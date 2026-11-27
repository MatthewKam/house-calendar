import { useState } from 'react';
import s from './Admin.module.css';

/** A short date: "Nov 27", from a UTC day ("2026-11-27"). */
export const shortDay = (day: string) =>
	new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * One number a day, as bars (a day with none is an empty slot), its title naming it. Pointing at a day shows
 * its value above; the latest day's is shown until then.
 */
export default function DayChart({ title, days, values }: { title: string; days: string[]; values: number[] }) {
	const [at, setAt] = useState<number | null>(null);
	const max = Math.max(1, ...values);
	const W = 10;
	const H = 100;
	const shown = at ?? values.length - 1;
	const total = values.reduce((a, b) => a + b, 0);
	return (
		<figure className={s.chart}>
			<figcaption className={s.chartHead}>
				<span className={s.chartTitle}>{title}</span>
				<span className={s.chartValue}>
					{shortDay(days[shown])}: <strong>{values[shown]}</strong>
				</span>
			</figcaption>
			<svg
				className={s.chartSvg}
				viewBox={`0 0 ${days.length * W} ${H}`}
				preserveAspectRatio="none"
				role="img"
				aria-label={`${title}: ${total} over ${days.length} days, ${values[values.length - 1]} on the latest`}
				onPointerMove={(e) => {
					const box = e.currentTarget.getBoundingClientRect();
					const i = Math.floor(((e.clientX - box.left) / box.width) * days.length);
					setAt(Math.max(0, Math.min(days.length - 1, i)));
				}}
				onPointerLeave={() => setAt(null)}
			>
				<line x1={0} x2={days.length * W} y1={H - 0.5} y2={H - 0.5} className={s.baseline} />
				{values.map((v, i) => {
					const h = v ? Math.max(2, (v / max) * (H - 4)) : 0;
					return (
						<rect
							key={days[i]}
							x={i * W + 1}
							y={H - h}
							width={W - 2}
							height={h}
							rx={1.5}
							className={i === shown ? s.barOn : s.bar}
						/>
					);
				})}
			</svg>
			<div className={s.chartAxis}>
				<span>{shortDay(days[0])}</span>
				<span>most {max}</span>
				<span>{shortDay(days[days.length - 1])}</span>
			</div>
		</figure>
	);
}
