import { useEffect, useRef, useState } from 'react';
import type { CookTimer } from '../../../../shared/cook.ts';
import { clock } from '../../lib/cook';
import s from './Recipes.module.css';

/** Quick picks for a timer, in minutes. */
const QUICK = [1, 3, 5, 10, 15, 20, 30];

/** Three soft beeps, and a buzz on a phone: a timer's done. */
function chime() {
	try {
		const audio = new AudioContext();
		[0, 0.35, 0.7].forEach((at) => {
			const tone = audio.createOscillator();
			const volume = audio.createGain();
			tone.frequency.value = 880;
			volume.gain.setValueAtTime(0.0001, audio.currentTime + at);
			volume.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + at + 0.02);
			volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.25);
			tone.connect(volume).connect(audio.destination);
			tone.start(audio.currentTime + at);
			tone.stop(audio.currentTime + at + 0.3);
		});
		setTimeout(() => void audio.close(), 1500);
	} catch {
		// No sound here: the timer still shows it's done.
	}
	navigator.vibrate?.([200, 100, 200]);
}

/**
 * Cooking: how long it's been since Start cooking, counting up, and timers set along the way ("cook 5
 * min"): quick picks or any number of minutes, several at once, each ringing when it's done, each
 * with what it's for if that's said ("Soup"). The timers are the cook's (kept by whoever shows this),
 * so cooking together can show them to the others.
 */
export default function CookingBar({
	startedAt,
	timers,
	onTimers,
	onDone,
	doneLabel = 'Done cooking',
}: {
	startedAt: number;
	timers: CookTimer[];
	onTimers: (timers: CookTimer[]) => void;
	onDone: () => void;
	doneLabel?: string;
}) {
	const [now, setNow] = useState(Date.now());
	const [picking, setPicking] = useState(false);
	const [typed, setTyped] = useState('');
	const [name, setName] = useState('');
	// Timers that have rung here (by id), so each rings once. Ones already done when they arrive (a
	// day-long recipe opened again) don't ring.
	const rang = useRef(new Set(timers.filter((t) => t.endsAt <= Date.now()).map((t) => t.id)));

	useEffect(() => {
		const tick = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(tick);
	}, []);
	// A timer reaching zero rings once.
	useEffect(() => {
		const due = timers.filter((t) => !rang.current.has(t.id) && t.endsAt <= now);
		if (!due.length) return;
		chime();
		due.forEach((t) => rang.current.add(t.id));
	}, [now, timers]);

	const start = (minutes: number) => {
		if (!(minutes > 0)) return;
		const label = name.trim().replace(/\s+/g, ' ').slice(0, 40);
		onTimers([...timers, { id: Date.now(), minutes, endsAt: Date.now() + minutes * 60_000, name: label || null }]);
		setPicking(false);
		setTyped('');
		setName('');
	};

	return (
		<div className={s.cooking} role="group" aria-label="Cooking">
			<div className={s.cookingRow}>
				<span className={s.elapsed} aria-label={`Cooking for ${clock(now - startedAt)}`}>
					⏱ {clock(now - startedAt)}
				</span>
				<button type="button" className={s.cookButton} aria-expanded={picking} onClick={() => setPicking(!picking)}>
					＋ Set a timer
				</button>
				<button type="button" className={s.doneCooking} onClick={onDone}>
					{doneLabel}
				</button>
			</div>
			{picking && (
				<form
					className={s.timerPick}
					onSubmit={(e) => {
						e.preventDefault();
						start(Number(typed));
					}}
				>
					<input
						className={s.timerName}
						placeholder="For what? (soup)"
						aria-label="What the timer is for"
						maxLength={40}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					{QUICK.map((m) => (
						<button key={m} type="button" className={s.chip} onClick={() => start(m)}>
							{m} min
						</button>
					))}
					<input
						className={s.timerInput}
						inputMode="numeric"
						placeholder="Min"
						aria-label="Minutes"
						value={typed}
						onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
					/>
					<button type="submit" className={s.cookButton} disabled={!Number(typed)}>
						Start
					</button>
				</form>
			)}
			{timers.length > 0 && (
				<ul className={s.timers}>
					{timers.map((t) => (
						<li key={t.id} className={`${s.timer} ${t.endsAt <= now ? s.timerRang : ''}`}>
							<span>
								{t.name ?? `${t.minutes} min timer`}: <b>{t.endsAt <= now ? 'Done!' : clock(t.endsAt - now)}</b>
							</span>
							<button
								type="button"
								className={s.timerClose}
								aria-label={t.endsAt <= now ? 'Put the timer away' : 'Stop the timer'}
								onClick={() => onTimers(timers.filter((x) => x.id !== t.id))}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
