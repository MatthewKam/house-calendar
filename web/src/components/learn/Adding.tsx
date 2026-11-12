import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Pic } from './art';
import { Board, SLIDE_MS } from './parts';
import { FRUIT } from './things';
import { at, between, fresh, shuffle, useRounds, type GameProps } from './rounds';
import s from './Learn.module.css';
import g from './LearnAdding.module.css';

/** Each side's smallest and biggest number, by level. */
const SIDES: [number, number][] = [
	[1, 3],
	[1, 4],
	[2, 5],
	[2, 5],
	[3, 7],
	[4, 10],
];
/** From level 4 some rounds are take-away; from level 5 the answer goes in on a number pad. */
const TAKE_FROM = 4;
const PAD_FROM = 5;
/** Numbers to choose from, before the pad. */
const CHOICES = [3, 4, 4, 4];
const ROUNDS = 3;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];

interface Round {
	take: boolean;
	a: number;
	b: number;
	fa: { id: string; one: string };
	fb: { id: string; one: string };
}

/**
 * Math (age 4). Adding: two plates, each with a number on its sign. Tap a plate's basket to put a fruit
 * on it (tap a fruit to take it off) until each plate has its number, then how many in all. Take-away
 * (from level 4): the plate starts full; tap fruit to move them to the "take away" bowl until it has
 * its number, then how many are left. The answer's picked from a few numbers, or from level 5 typed on
 * a number pad. Too many on a plate turns it and its number red.
 */
export default function Adding({ level, onDone, onBack }: GameProps) {
	// Right: the mascot slides across, wiping the plates clean, before the next round.
	const rounds = useRounds(ROUNDS, onDone, SLIDE_MS);
	const pad = level >= PAD_FROM;
	const plan = useMemo<Round[]>(() => {
		// Two fruit a round, none seen recently.
		const fruit = fresh('math.fruit', FRUIT, ROUNDS * 2, (f) => f.id);
		return Array.from({ length: ROUNDS }, (_, i) => {
			const [lo, hi] = at(SIDES, level);
			const [fa, fb] = [fruit[i * 2], fruit[i * 2 + 1]];
			// From level 4, the middle round (and sometimes another) takes away.
			const take = level >= TAKE_FROM && (i === 1 || Math.random() < 0.3);
			if (take) {
				const a = between(Math.max(3, lo + 1), hi + 2);
				return { take, a, b: between(1, a - 1), fa, fb: fa };
			}
			return { take, a: between(lo, hi), b: between(lo, hi), fa, fb };
		});
	}, [level]);
	const r = plan[rounds.round];
	const answerIs = r.take ? r.a - r.b : r.a + r.b;
	// Adding: how many on each plate. Taking away: how many are left on the plate, and in the bowl.
	const [left, setLeft] = useState(0);
	const [right, setRight] = useState(0);
	const [typed, setTyped] = useState('');
	// The last wrong answer, and how many so far (so the same one tapped again shakes again).
	const [wrong, setWrong] = useState<number | null>(null);
	const [misses, setMisses] = useState(0);
	const ready = r.take ? right === r.b : left === r.a && right === r.b;
	const options = useMemo(() => {
		const near = shuffle([answerIs - 2, answerIs - 1, answerIs + 1, answerIs + 2].filter((x) => x >= 0));
		return shuffle([answerIs, ...near.slice(0, at(CHOICES, level) - 1)]);
	}, [answerIs, level]);

	useEffect(() => {
		setLeft(r.take ? r.a : 0);
		setRight(0);
		setTyped('');
		setWrong(null);
	}, [r]);

	function put(side: 'a' | 'b', change: 1 | -1) {
		if (rounds.got) return;
		if (r.take) {
			// Taking away moves fruit between the plate and the bowl.
			const moved = Math.max(0, Math.min(r.a, right + change));
			setRight(moved);
			setLeft(r.a - moved);
			return;
		}
		(side === 'a' ? setLeft : setRight)((n) => Math.max(0, n + change));
	}
	function answer(x: number) {
		if (x === answerIs) return rounds.tap(true);
		setWrong(x);
		setMisses((n) => n + 1);
		setTyped('');
		rounds.tap(false);
	}

	return (
		<Board onBack={onBack} total={ROUNDS} done={rounds.round + (rounds.got ? 1 : 0)} cheer={rounds.got && 'slide'}>
			{(box) => {
				const wide = box.w > box.h * 1.15;
				const GAP = 12;
				// The answer: the numbers to pick, in a row, or the pad; beside the plates on its side and under
				// them upright.
				const padBeside = wide;
				const keyRows = pad ? 4 : 1;
				const keyCols = pad ? 3 : options.length;
				const keySize = Math.floor(
					Math.min(
						84,
						wide
							? (box.h - 90 - (keyRows - 1) * 8) / keyRows
							: ((pad ? box.h * 0.45 : box.h * 0.22) - 50 - (keyRows - 1) * 8) / keyRows,
						((wide ? box.w * 0.36 : box.w) - 16 - (keyCols - 1) * 8) / keyCols,
					),
				);
				const answerW = wide ? keySize * keyCols + (keyCols - 1) * 8 + 24 : 0;
				const answerH = wide ? 0 : keySize * (keyRows + 0.9) + (keyRows - 1) * 8 + 40;
				// Each plate's a circle (D across), with its sign and basket. On its side: side by side, the sign
				// with its basket to its right above each. Upright: one above the other, the sign and its basket on
				// the left.
				const extra = 0.4;
				const D = Math.floor(
					Math.min(
						260,
						wide
							? Math.min((box.w - answerW - 60) / 2, box.h - Math.min(84, box.h * 0.24) - 2 * GAP)
							: Math.min((box.w - answerW - 2 * GAP) / (1 + extra), (box.h - answerH - 40 - 2 * GAP) / 2),
					),
				);
				const plate = (side: 'a' | 'b') => {
					const n = side === 'a' ? left : right;
					const want = side === 'a' ? r.a : r.b;
					const fruit = side === 'a' ? r.fa : r.fb;
					const bowl = r.take && side === 'b';
					const over = !r.take && n > want;
					const most = Math.max(n, r.take ? r.a : want, 1);
					// The fruit sit in the plate's middle, as many to a row as makes a square.
					const perRow = Math.ceil(Math.sqrt(most));
					const item = Math.floor((D * 0.62) / perRow);
					const extraSize = Math.min(84, D * 0.3);
					const sign = (
						<span
							className={`${g.sign} ${over ? g.signOver : n === want && (bowl || !r.take) ? g.signDone : ''}`}
							style={{ fontSize: Math.max(30, Math.min(56, D * 0.22)) }}
						>
							{bowl ? `− ${want}` : want}
						</span>
					);
					const basket = !r.take && (
						<button
							type="button"
							className={g.basket}
							onClick={() => put(side, 1)}
							disabled={rounds.got}
							aria-label={`Put a ${fruit.one} on`}
							style={{ width: extraSize, height: extraSize }}
						>
							<Pic id={fruit.id} />
							<span aria-hidden="true">+</span>
						</button>
					);
					const dish = (
						<div className={`${bowl ? g.bowl : g.plate} ${over ? g.plateOver : ''}`} style={{ width: D, height: D }}>
							<div
								className={`${g.onPlates} ${rounds.got ? g.wiped : ''}`}
								// Wiped as the mascot passes: side by side, the left plate first; one above the other, both as it crosses the middle.
								style={
									{
										gridTemplateColumns: `repeat(${perRow}, ${item}px)`,
										'--wipeAt': wide ? (side === 'a' ? 0.4 : 0.55) : 0.47,
									} as CSSProperties
								}
							>
								{Array.from({ length: n }, (_, i) => (
									<button
										key={i}
										type="button"
										className={g.onPlate}
										style={{ width: item, height: item }}
										onClick={() => put(side, r.take ? (bowl ? -1 : 1) : -1)}
										aria-label={
											bowl ? `Put a ${fruit.one} back` : r.take ? `Take a ${fruit.one} away` : `Take a ${fruit.one} off`
										}
									>
										<Pic id={fruit.id} />
									</button>
								))}
							</div>
						</div>
					);
					// On its side: the sign, the plate, then the basket, top to bottom. Upright: the sign with the
					// basket under it, then the plate.
					return wide ? (
						<div className={g.side}>
							<div className={g.sideTagRow}>
								{sign}
								{basket}
							</div>
							{dish}
						</div>
					) : (
						<div className={g.sideRow}>
							<div className={g.sideTag}>
								{sign}
								{basket}
							</div>
							{dish}
						</div>
					);
				};
				const picking = ready && !rounds.got;
				const answers = pad ? (
					<div
						className={g.numPad}
						style={{ gridTemplateColumns: `repeat(3, ${keySize}px)`, opacity: picking ? 1 : 0.35 }}
					>
						{KEYS.map((k) => (
							<button
								key={k}
								type="button"
								className={`${s.choice} ${k === 'ok' ? g.choiceGo : ''}`}
								style={{ width: keySize, height: keySize, fontSize: keySize * 0.42 }}
								disabled={!picking || ((k === 'ok' || k === 'back') && !typed)}
								aria-label={k === 'back' ? 'Delete' : k === 'ok' ? "That's it" : k}
								onClick={() =>
									k === 'back'
										? setTyped(typed.slice(0, -1))
										: k === 'ok'
											? answer(Number(typed))
											: typed.length < 2 && setTyped(typed + k)
								}
							>
								{k === 'back' ? '⌫' : k === 'ok' ? '✓' : k}
							</button>
						))}
					</div>
				) : (
					<div
						className={s.choices}
						style={{
							display: 'grid',
							gridTemplateColumns: `repeat(${keyCols}, ${keySize}px)`,
							gap: 8,
							opacity: picking || rounds.got ? 1 : 0.35,
						}}
					>
						{options.map((x) => (
							<button
								key={`${x}-${wrong === x ? misses : 0}`}
								type="button"
								disabled={!picking}
								onClick={() => answer(x)}
								className={`${s.choice} ${rounds.got && x === answerIs ? s.choiceRight : wrong === x ? s.wiggle : ''}`}
								style={{ width: keySize, height: keySize, fontSize: keySize * 0.45 }}
							>
								{x}
							</button>
						))}
					</div>
				);
				return (
					<div className={padBeside ? s.row : s.column}>
						<div className={wide ? g.plates : g.platesUp}>
							{plate('a')}
							{!r.take && (
								<span className={g.plus} aria-hidden="true">
									+
								</span>
							)}
							{plate('b')}
						</div>
						<div className={g.answerArea}>
							<div className={g.equals}>
								<span className={g.plus} aria-hidden="true">
									=
								</span>
								<span
									key={pad ? misses : 0}
									className={`${s.answer} ${rounds.got ? g.answerGot : pad && misses ? s.wiggle : ''}`}
									style={{ fontSize: Math.max(28, keySize * 0.5), minWidth: keySize * 1.2 }}
								>
									{rounds.got ? answerIs : typed || '?'}
								</span>
							</div>
							{answers}
						</div>
					</div>
				);
			}}
		</Board>
	);
}
