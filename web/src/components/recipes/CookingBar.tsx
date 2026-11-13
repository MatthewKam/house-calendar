import { useEffect, useState } from 'react';
import s from './Recipes.module.css';

/** Quick picks for a timer, in minutes. */
const QUICK = [1, 3, 5, 10, 15, 20, 30];

interface Timer {
	id: number;
	minutes: number;
	endsAt: number;
	/** Rung (it reached zero), until it's put away. */
	rang: boolean;
}

/** "4:05", "1:02:30". */
function clock(ms: number) {
	const total = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const sec = String(total % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

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
 * min"): quick picks or any number of minutes, several at once, each ringing when it's done.
 */
export default function CookingBar({ startedAt, onDone }: { startedAt: number; onDone: () => void }) {
	const [now, setNow] = useState(Date.now());
	const [timers, setTimers] = useState<Timer[]>([]);
	const [picking, setPicking] = useState(false);
	const [typed, setTyped] = useState('');

	useEffect(() => {
		const tick = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(tick);
	}, []);
	// A timer reaching zero rings once.
	useEffect(() => {
		const due = timers.filter((t) => !t.rang && t.endsAt <= now);
		if (!due.length) return;
		chime();
		setTimers((all) => all.map((t) => (due.includes(t) ? { ...t, rang: true } : t)));
	}, [now, timers]);

	const start = (minutes: number) => {
		if (!(minutes > 0)) return;
		setTimers((all) => [...all, { id: Date.now(), minutes, endsAt: Date.now() + minutes * 60_000, rang: false }]);
		setPicking(false);
		setTyped('');
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
					Done cooking
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
						<li key={t.id} className={`${s.timer} ${t.rang ? s.timerRang : ''}`}>
							<span>
								{t.minutes} min timer: <b>{t.rang ? 'Done!' : clock(t.endsAt - now)}</b>
							</span>
							<button
								type="button"
								className={s.timerClose}
								aria-label={t.rang ? 'Put the timer away' : 'Stop the timer'}
								onClick={() => setTimers((all) => all.filter((x) => x.id !== t.id))}
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
