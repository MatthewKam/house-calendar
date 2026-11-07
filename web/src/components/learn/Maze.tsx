import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board, type Box } from "./parts";
import { makeMap } from "./mazeMap";
import { any, at, CHEER_MS, type GameProps } from "./rounds";
import s from "../../styles/Learn.module.css";

/** The map's size in stops (rows, columns) and its keys and gates, by level. Level 1 is already a real maze. */
const SIZES: [number, number, number][] = [[4, 5, 0], [4, 6, 0], [5, 6, 1], [5, 7, 1], [6, 7, 2], [6, 8, 2]];
/** Splashes (or locked gates) a play can have and still count as first try. */
const SLIPS = 1;

/** Who's looking for what each play, and where: the walls and the path in that place's colors. */
const QUESTS = [
	{ who: "bee", name: "Bee", wants: "flower", what: "the flower", wall: "#7cc36a", path: "#f3e3b5", been: "#faf0d2" },
	{ who: "bear", name: "Bear", wants: "honey", what: "the honey", wall: "#3f7d3f", path: "#d9b98a", been: "#efdcb8" },
	{ who: "butterfly", name: "Butterfly", wants: "flower", what: "the flower", wall: "#8fcf7a", path: "#e6d2b0", been: "#f3e7d2" },
	{ who: "monkey", name: "Monkey", wants: "banana", what: "the banana", wall: "#2f7a4a", path: "#c9a16a", been: "#e6cfa6" },
	{ who: "dog", name: "Dog", wants: "bone", what: "the bone", wall: "#6cbf5e", path: "#d8d2c4", been: "#ece8df" },
	{ who: "mouse", name: "Mouse", wants: "cheese", what: "the cheese", wall: "#c98d5a", path: "#f5efe3", been: "#fbf8f1" },
	{ who: "cat", name: "Cat", wants: "fish", what: "the fish", wall: "#4a90c8", path: "#cfc6b4", been: "#e9e2d4" },
	{ who: "rabbit", name: "Rabbit", wants: "carrot", what: "the carrot", wall: "#8a5a3b", path: "#e8d3a8", been: "#f3e6cb" },
];

/**
 * Maze (age 4): an animal finds its way to what it wants (Bee to the flower, Monkey to the banana). Tap a
 * square in line with it (along an open path) and it walks there. Walls can't be crossed, so dead ends
 * mean turning back. Three mazes a game, each a new animal and map, bigger as it levels up; from level 3 a locked gate
 * is in the way, and its key is somewhere off the path.
 */
/** A maze's squares are never smaller than this (px), so a 4-year-old can tap them. */
const SMALLEST_SQUARE = 38;

/** How many mazes make a game. */
const ROUNDS = 3;

export default function Maze({ level, onDone, onBack }: GameProps) {
	const [round, setRound] = useState(0);
	const [cheering, setCheering] = useState(false);
	const firstTry = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	// There: the cheer, then the next maze (or the end).
	function home(perfect: boolean) {
		if (perfect) firstTry.current += 1;
		setCheering(true);
		timer.current = setTimeout(() => {
			setCheering(false);
			if (round + 1 >= ROUNDS) onDone(ROUNDS, firstTry.current);
			else setRound(round + 1);
		}, CHEER_MS);
	}
	return (
		<Board onBack={onBack} total={ROUNDS} done={round + (cheering ? 1 : 0)} cheer={cheering}>
			{(box) => <OneMaze key={round} level={level} box={box} onHome={home} />}
		</Board>
	);
}

/** One maze: a new animal, what it wants and a map. `onHome` once it's there (perfect: few bumps). */
function OneMaze({ level, box, onHome }: { level: number; box: Box; onHome: (perfect: boolean) => void }) {
	const [levelRows, levelCols, keys] = at(SIZES, level);
	const look = useMemo(() => any(QUESTS), []);
	// The level's size, but never so big a square's too small to tap on this screen (a phone on its side):
	// its long side and short side each fit as many squares as there's room for at that size. Chosen once
	// a maze starts, so turning the screen doesn't change it.
	const { grid, start } = useMemo(() => {
		const most = (px: number) => Math.max(2, Math.floor((Math.floor(px / SMALLEST_SQUARE) + 1) / 2));
		const room = { long: Math.max(box.w, box.h - 48), short: Math.min(box.w, box.h - 48) };
		return makeMap(Math.min(levelRows, most(room.short)), Math.min(levelCols, most(room.long)), keys);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [levelRows, levelCols, keys]);
	const [walker, setWalker] = useState(start);
	const [trail, setTrail] = useState<string[]>([]);
	const [keysHeld, setKeysHeld] = useState(0);
	const [opened, setOpened] = useState<string[]>([]);
	const [taken, setTaken] = useState<string[]>([]);
	const [bump, setBump] = useState<{ at: string; n: number } | null>(null);
	const [slips, setSlips] = useState(0);
	const [home, setHome] = useState(false);
	const walking = useRef(false);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	useEffect(() => () => timers.current.forEach(clearTimeout), []);
	// What's changed as it walks, read between steps.
	const now = useRef({ at: start, keysHeld: 0, opened: [] as string[], taken: [] as string[] });

	function oops(key: string, counts: boolean) {
		setBump((b) => ({ at: key, n: (b?.n ?? 0) + 1 }));
		if (counts) setSlips((n) => n + 1);
	}

	/** One step onto a square next to it, if it can (the gate needs a key): false if it can't. */
	function stepTo(r: number, c: number) {
		const key = `${r},${c}`;
		const cell = grid[r][c];
		const st = now.current;
		if (cell === "#") return false;
		if (cell === "G" && !st.opened.includes(key)) {
			if (st.keysHeld === 0) return false;
			st.keysHeld -= 1;
			st.opened = [...st.opened, key];
		}
		if (cell === "K" && !st.taken.includes(key)) {
			st.keysHeld += 1;
			st.taken = [...st.taken, key];
		}
		const from = st.at.join();
		st.at = [r, c];
		setTrail((t) => [...t, from]);
		setWalker([r, c]);
		setKeysHeld(st.keysHeld);
		setOpened(st.opened);
		setTaken(st.taken);
		if (cell === "H") {
			setHome(true);
			timers.current.push(setTimeout(() => onHome(slips <= SLIPS), 700));
		}
		return true;
	}

	function tap(r: number, c: number) {
		if (home || walking.current) return;
		const [br, bc] = now.current.at;
		const key = `${r},${c}`;
		if (r === br && c === bc) return;
		// In line with it: walk there a step at a time, stopping at a wall or a locked gate.
		if (r !== br && c !== bc) return oops(key, false);
		const dr = Math.sign(r - br);
		const dc = Math.sign(c - bc);
		const steps = Math.abs(r - br) + Math.abs(c - bc);
		// A wall (or a locked gate, with no key) right next to it that way: a bump.
		const [nr, nc] = [br + dr, bc + dc];
		const first = grid[nr][nc];
		if (first === "#" || (first === "G" && !now.current.opened.includes(`${nr},${nc}`) && now.current.keysHeld === 0)) {
			return oops(`${nr},${nc}`, true);
		}
		walking.current = true;
		let i = 1;
		const walk = () => {
			if (i > steps || !stepTo(br + dr * i, bc + dc * i) || grid[br + dr * i][bc + dc * i] === "H") {
				walking.current = false;
				return;
			}
			i += 1;
			timers.current.push(setTimeout(walk, 170));
		};
		walk();
	}


		const keysRow = keys > 0 ? 48 : 0;
		// A wide map on a tall screen (or the other way) is shown turned, so its squares are bigger.
		const turned = (box.h > box.w) !== (grid.length > grid[0].length);
		const shown = turned ? grid[0].map((_, c) => grid.map((row) => row[c])) : grid;
		const square = Math.floor(Math.min((box.w - 16) / shown[0].length, (box.h - keysRow - 16) / shown.length, 96));
		return (
			<div className={s.column}>
				{keys > 0 && (
					<span className={s.keysHeld} style={{ height: keysRow - 8 }} aria-label={`${keysHeld} ${keysHeld === 1 ? "key" : "keys"}`}>
						{Array.from({ length: keys }, (_, i) => <span key={i} className={i < keysHeld ? "" : s.keyEmpty}><Pic id="key" /></span>)}
					</span>
				)}
				<div className={s.map} style={{ gridTemplateColumns: `repeat(${shown[0].length}, ${square}px)`, "--wall": look.wall, "--path": look.path, "--been": look.been } as CSSProperties}>
					{shown.map((row, i) => row.map((cell, j) => {
						const [r, c] = turned ? [j, i] : [i, j];
						const key = `${r},${c}`;
						const here = walker[0] === r && walker[1] === c;
						const label = cell === "#" ? "Wall" : cell === "H" ? look.what : cell === "K" && !taken.includes(key) ? "A key"
							: cell === "G" && !opened.includes(key) ? "A locked gate" : here ? look.name : "A square";
						return (
							<button key={`${key}-${bump?.at === key ? bump.n : 0}`} type="button" aria-label={label} onClick={() => tap(r, c)}
								style={{ width: square, height: square }}
								className={`${s.square} ${cell === "#" ? s.wall : trail.includes(key) ? s.been : ""} ${bump?.at === key ? s.wiggle : ""}`}>
								{cell === "H" && <Pic id={look.wants} label={look.what} />}
								{cell === "K" && !taken.includes(key) && <Pic id="key" />}
								{cell === "G" && !opened.includes(key) && <Pic id="gate" />}
								{here && <span key={trail.length} className={`${s.walker} ${home ? s.hopForever : s.step}`}><Pic id={look.who} label={look.name} /></span>}
							</button>
						);
					}))}
				</div>
			</div>
		);
}
