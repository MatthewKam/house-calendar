import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board } from "./parts";
import { makeMap } from "./mazeMap";
import { any, at, type GameProps } from "./rounds";
import s from "../../styles/Learn.module.css";

/** The map's size in stops (rows, columns) and its keys and gates, by level. */
const SIZES: [number, number, number][] = [[3, 4, 0], [3, 5, 0], [4, 5, 1], [4, 6, 1], [5, 6, 2], [5, 7, 2]];
/** Splashes (or locked gates) a play can have and still count as first try. */
const SLIPS = 1;

/** Different looks each play: stepping stones over a pond, a path through the woods, a snowy trail. */
const LOOKS = [
	{ name: "pond", wall: "#4a90c8", path: "#cfc6b4", been: "#e9e2d4" },
	{ name: "woods", wall: "#3f7d3f", path: "#d9b98a", been: "#efdcb8" },
	{ name: "snow", wall: "#9cc3e6", path: "#ffffff", been: "#e6f1fb" },
];

/**
 * Bear's way home (age 4): tap a square in line with Bear (along an open path) and he walks there; find
 * the way to his house. Walls can't be crossed, so dead ends mean turning back. A new map each play,
 * bigger as it levels up; from level 3 a locked gate is in the way, and its key is somewhere off the path.
 */
export default function Maze({ level, onDone, onBack }: GameProps) {
	const [rows, cols, keys] = at(SIZES, level);
	const look = useMemo(() => any(LOOKS), []);
	const { grid, start } = useMemo(() => makeMap(rows, cols, keys), [rows, cols, keys]);
	const [bear, setBear] = useState(start);
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
	// What's changed as Bear walks, read between steps.
	const now = useRef({ bear: start, keysHeld: 0, opened: [] as string[], taken: [] as string[] });

	function oops(key: string, counts: boolean) {
		setBump((b) => ({ at: key, n: (b?.n ?? 0) + 1 }));
		if (counts) setSlips((n) => n + 1);
	}

	/** One step onto a square next to Bear, if he can (the gate needs a key): false if he can't. */
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
		const from = st.bear.join();
		st.bear = [r, c];
		setTrail((t) => [...t, from]);
		setBear([r, c]);
		setKeysHeld(st.keysHeld);
		setOpened(st.opened);
		setTaken(st.taken);
		if (cell === "H") {
			setHome(true);
			timers.current.push(setTimeout(() => onDone(1, slips <= SLIPS ? 1 : 0), 2600));
		}
		return true;
	}

	function tap(r: number, c: number) {
		if (home || walking.current) return;
		const [br, bc] = now.current.bear;
		const key = `${r},${c}`;
		if (r === br && c === bc) return;
		// In line with Bear: walk there a step at a time, stopping at a wall or a locked gate.
		if (r !== br && c !== bc) return oops(key, false);
		const dr = Math.sign(r - br);
		const dc = Math.sign(c - bc);
		const steps = Math.abs(r - br) + Math.abs(c - bc);
		// A wall (or a locked gate, with no key) right next to him that way: a bump.
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

	return (
		<Board onBack={onBack} cheer={home}>
			{(box) => {
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
								const here = bear[0] === r && bear[1] === c;
								const label = cell === "#" ? "Wall" : cell === "H" ? "Bear's house" : cell === "K" && !taken.includes(key) ? "A key"
									: cell === "G" && !opened.includes(key) ? "A locked gate" : here ? "Bear" : "A square";
								return (
									<button key={`${key}-${bump?.at === key ? bump.n : 0}`} type="button" aria-label={label} onClick={() => tap(r, c)}
										style={{ width: square, height: square }}
										className={`${s.square} ${cell === "#" ? s.wall : trail.includes(key) ? s.been : ""} ${bump?.at === key ? s.wiggle : ""}`}>
										{cell === "H" && <Pic id="house" />}
										{cell === "K" && !taken.includes(key) && <Pic id="key" />}
										{cell === "G" && !opened.includes(key) && <Pic id="gate" />}
										{here && <span key={trail.length} className={`${s.bear} ${home ? s.hopForever : s.step}`}><Pic id="bear" label="Bear" /></span>}
									</button>
								);
							}))}
						</div>
					</div>
				);
			}}
		</Board>
	);
}
