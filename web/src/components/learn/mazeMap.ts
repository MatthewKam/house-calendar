import { any, shuffle } from "./rounds";

type Cell = "." | "#" | "H" | "K" | "G";

/**
 * A new map: a maze on every other square (walls between), Bear in a corner and home as far from him
 * as the paths go. With keys, each gate sits on the way home, and its key down a side path before it.
 */
export function makeMap(rows: number, cols: number, keys: number) {
	const h = rows * 2 - 1;
	const w = cols * 2 - 1;
	const grid: Cell[][] = Array.from({ length: h }, () => Array<Cell>(w).fill("#"));
	// Carve: a random walk that backs up at dead ends, visiting every stop once.
	const seen = new Set<string>();
	const stack: [number, number][] = [[0, 0]];
	seen.add("0,0");
	grid[0][0] = ".";
	while (stack.length) {
		const [r, c] = stack[stack.length - 1];
		const next = shuffle([[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as [number, number][])
			.find(([nr, nc]) => nr >= 0 && nc >= 0 && nr < rows && nc < cols && !seen.has(`${nr},${nc}`));
		if (!next) {
			stack.pop();
			continue;
		}
		const [nr, nc] = next;
		seen.add(`${nr},${nc}`);
		grid[r + nr][c + nc] = ".";
		grid[nr * 2][nc * 2] = ".";
		stack.push(next);
	}
	// Bear starts in a corner.
	const corners: [number, number][] = [[0, 0], [0, w - 1], [h - 1, 0], [h - 1, w - 1]];
	const start = any(corners);
	// How far each square is from Bear, and the way back from each.
	const from = new Map<string, string | null>([[start.join(), null]]);
	const order: [number, number][] = [start];
	for (let i = 0; i < order.length; i++) {
		const [r, c] = order[i];
		for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
			if (nr < 0 || nc < 0 || nr >= h || nc >= w || grid[nr][nc] === "#" || from.has(`${nr},${nc}`)) continue;
			from.set(`${nr},${nc}`, `${r},${c}`);
			order.push([nr, nc]);
		}
	}
	// Home: the farthest stop.
	const home = [...order].reverse().find(([r, c]) => r % 2 === 0 && c % 2 === 0)!;
	grid[home[0]][home[1]] = "H";
	const way: string[] = [];
	for (let at: string | null = home.join(); at; at = from.get(at)!) way.unshift(at);
	const onWay = new Set(way);
	// Gates along the way home, and each key on a side path before its gate.
	for (let k = 1; k <= keys; k++) {
		const gate = way[Math.round((way.length * k) / (keys + 1))].split(",").map(Number);
		const before = new Set(way.slice(0, way.indexOf(gate.join())));
		// Side squares whose way back to Bear joins the way home before this gate (and after the last).
		const sides = order.filter(([r, c]) => {
			const key = `${r},${c}`;
			if (onWay.has(key) || grid[r][c] !== ".") return false;
			let up: string | null = key;
			while (up && !onWay.has(up)) up = from.get(up)!;
			return !!up && before.has(up) && (k === 1 || way.indexOf(up) > way.indexOf(way[Math.round((way.length * (k - 1)) / (keys + 1))]));
		});
		// The far end of a side path, or failing that, a square on the way before the gate.
		const spot = sides.length ? sides[sides.length - 1] : way[Math.max(1, way.indexOf(gate.join()) - 2)].split(",").map(Number);
		grid[gate[0]][gate[1]] = "G";
		grid[spot[0]][spot[1]] = "K";
	}
	return { grid, start };
}
