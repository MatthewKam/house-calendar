import { useMemo, useState, type CSSProperties } from "react";
import { Pic } from "./art";
import { Board } from "./parts";
import { makeMap } from "./mazeMap";
import { any, at, type GameProps } from "./rounds";
import { say } from "./sound";
import s from "../../styles/Learn.module.css";

/** The map's size in stops (rows, columns) and its keys and gates, by level. */
const SIZES: [number, number, number][] = [[3, 4, 0], [3, 5, 0], [4, 5, 1], [4, 6, 1], [5, 6, 2], [5, 7, 2]];
/** Splashes (or locked gates) a play can have and still count as first try. */
const SLIPS = 1;

/** Different looks each play: stepping stones over a pond, a path through the woods, a snowy trail. */
const LOOKS = [
	{ name: "pond", wall: "#4a90c8", path: "#cfc6b4", been: "#e9e2d4", oops: "Splash!" },
	{ name: "woods", wall: "#3f7d3f", path: "#d9b98a", been: "#efdcb8", oops: "Too prickly!" },
	{ name: "snow", wall: "#9cc3e6", path: "#ffffff", been: "#e6f1fb", oops: "Brr!" },
];

/**
 * Bear's way home (age 4): tap the square next to Bear to take a step, and find the way to his house.
 * Walls can't be crossed, so dead ends mean turning back. A new map each play, bigger as it levels up;
 * from level 3 a locked gate is in the way, and its key is somewhere off the path.
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

	function step(r: number, c: number) {
		if (home) return;
		const key = `${r},${c}`;
		const cell = grid[r][c];
		const next = Math.abs(bear[0] - r) + Math.abs(bear[1] - c) === 1;
		const oops = (words: string, counts: boolean) => {
			setBump((b) => ({ at: key, n: (b?.n ?? 0) + 1 }));
			if (counts) setSlips((n) => n + 1);
			if (words) say(words);
		};
		if (r === bear[0] && c === bear[1]) return;
		if (cell === "#") return oops(look.oops, next);
		if (!next) return oops("", false);
		if (cell === "G" && !opened.includes(key)) {
			if (keysHeld === 0) return oops("Locked!", true);
			setKeysHeld(keysHeld - 1);
			setOpened([...opened, key]);
			say("Open!");
		}
		if (cell === "K" && !taken.includes(key)) {
			setTaken([...taken, key]);
			setKeysHeld(keysHeld + 1);
			say("A key!");
		}
		setTrail([...trail, bear.join()]);
		setBear([r, c]);
		if (cell === "H") {
			setHome(true);
			say("Home!");
			setTimeout(() => onDone(1, slips <= SLIPS ? 1 : 0), 2600);
		}
	}

	return (
		<Board onBack={onBack} className={s.scene}>
			{keys > 0 && (
				<div className={s.ask}>
					<span className={s.keysHeld} aria-label={`${keysHeld} ${keysHeld === 1 ? "key" : "keys"}`}>
						{Array.from({ length: keysHeld }, (_, i) => <Pic key={i} id="key" />)}
					</span>
				</div>
			)}
			<div className={s.map} style={{ "--cols": grid[0].length, "--rows": grid.length, "--wall": look.wall, "--path": look.path, "--been": look.been } as CSSProperties}>
				{grid.map((row, r) => row.map((cell, c) => {
					const key = `${r},${c}`;
					const here = bear[0] === r && bear[1] === c;
					const label = cell === "#" ? "Wall" : cell === "H" ? "Bear's house" : cell === "K" && !taken.includes(key) ? "A key"
						: cell === "G" && !opened.includes(key) ? "A locked gate" : here ? "Bear" : "A square";
					return (
						<button key={`${key}-${bump?.at === key ? bump.n : 0}`} type="button" aria-label={label} onClick={() => step(r, c)}
							className={`${s.square} ${cell === "#" ? s.wall : trail.includes(key) ? s.been : ""} ${bump?.at === key ? s.wiggle : ""}`}>
							{cell === "H" && <Pic id="house" />}
							{cell === "K" && !taken.includes(key) && <Pic id="key" />}
							{cell === "G" && !opened.includes(key) && <Pic id="gate" />}
							{here && <span key={trail.length} className={`${s.bear} ${home ? s.hopForever : s.step}`}><Pic id="bear" label="Bear" /></span>}
						</button>
					);
				}))}
			</div>
		</Board>
	);
}
